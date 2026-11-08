import { analyseRun, leadOf } from './analysis'
import type { ClickingAnalysis, RunAnalysis, TrackingAnalysis } from './analysis'
import { RUN_DURATION_MS } from './scenario'
import type { RunFilter, RunStore, RunSummary } from './storage'
import type { ScenarioId } from './types'

/**
 * One Run as the aggregators see it: its summary (Score, Scenario, Warm-up flag, Session id, start time) and its Analysis.
 * Aggregators are pure over arrays of these, so any grouping of Runs works (a Session, a day, one Sensitivity, ...).
 * A `RunRecord` fits `run`.
 */
export interface AnalysedRun {
  run: RunSummary
  analysis: RunAnalysis
}

/**
 * Loads the Runs the filter selects and analyses each from its stored input (raw data is the source of truth, so nothing
 * derived is ever stored).
 * shortcut: an Analysis costs about 100 ms per Run (a 30 s Run at a 1 kHz mouse), so a caller that loads often passes a `cache`
 * (Run id to Analysis, filled here; Runs never change under an id, an import of the same id carries the same data). Nothing
 * is persisted: the first History after a page load pays for every Run. Persist the Analysis next to the Run, or speed up
 * `analyseRun`, when that gets slow.
 */
export async function loadAnalysed(store: RunStore, filter?: RunFilter, cache = new Map<string, RunAnalysis>()): Promise<AnalysedRun[]> {
  const items: AnalysedRun[] = []
  for (const run of await store.list(filter)) {
    let analysis = cache.get(run.id)
    if (!analysis) {
      const record = await store.get(run.id)
      if (!record) continue // deleted between the list and the get
      try {
        analysis = analyseRun(record)
      } catch {
        continue // A Run of a Scenario this build does not know (imported from a newer one): it cannot be analysed, so it is not shown.
      }
      cache.set(run.id, analysis)
    }
    items.push({ run, analysis })
  }
  return items
}

/** The Analysis of several Clicking Runs pooled into one: the same figures as `ClickingAnalysis`, minus the movement list. */
export type ClickingMetrics = Omit<ClickingAnalysis, 'movements'>

/** The Analysis of several Tracking Runs pooled into one: the same figures as `TrackingAnalysis`, with `samples` and `timeOnTargetMs` summed. */
export type TrackingMetrics = TrackingAnalysis

export type Metrics = ClickingMetrics | TrackingMetrics

/** All counted Runs of one Scenario. Scores of different Scenarios are in different units, so they are never mixed. */
export interface ScenarioAggregate {
  scenario: ScenarioId
  /** Runs counted: Warm-up Runs are not. */
  runs: number
  /** Score in the Scenario's own unit (Strafe is a percentage, Switch a count of targets). */
  score: { mean: number; best: number }
  metrics: Metrics
}

export interface Aggregate {
  /** One per Scenario played, in the order each was first played. */
  scenarios: ScenarioAggregate[]
  /** Warm-up Runs left out of everything above. */
  warmups: number
}

const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d)

function poolClicking(list: readonly ClickingAnalysis[]): ClickingMetrics {
  const movements = list.flatMap((a) => a.movements)
  const sumOf = (pick: (a: ClickingAnalysis) => number) => list.reduce((s, a) => s + pick(a), 0)
  const total = (pick: (m: ClickingAnalysis['movements'][number]) => number) => movements.reduce((s, m) => s + pick(m), 0)
  const movementCount = sumOf((a) => a.movementCount)
  const shots = sumOf((a) => a.shots)
  const hits = sumOf((a) => a.hits)
  const overshoots = sumOf((a) => a.overshoots)
  const undershoots = sumOf((a) => a.undershoots)
  return {
    category: 'clicking',
    movementCount,
    shots,
    hits,
    accuracy: ratio(hits, shots),
    // Distance over time of all the Aim Movements together, not the Runs' speeds averaged.
    mouseSpeed: ratio(total((m) => m.pathLength), total((m) => m.endMs - m.startMs) / 1000),
    overshoots,
    undershoots,
    overshootRate: ratio(overshoots, movementCount),
    undershootRate: ratio(undershoots, movementCount),
    pathDeviation: ratio(total((m) => m.pathDeviation), movementCount),
    smoothness: ratio(total((m) => m.velocityPeaks), movementCount),
  }
}

function poolTracking(list: readonly TrackingAnalysis[]): TrackingMetrics {
  const sumOf = (pick: (a: TrackingAnalysis) => number) => list.reduce((s, a) => s + pick(a), 0)
  const samples = sumOf((a) => a.samples)
  // A Run's mean counts for as many steps as it was measured over; a Run with no sample counts for nothing.
  const bySamples = (pick: (a: TrackingAnalysis) => number) => ratio(sumOf((a) => pick(a) * a.samples), samples)
  const meanOffset = bySamples((a) => a.meanOffset)
  const timeOnTargetMs = sumOf((a) => a.timeOnTargetMs)
  return {
    category: 'tracking',
    meanOffset,
    lead: leadOf(meanOffset),
    samples,
    timeOnTargetMs,
    timeOnTargetShare: ratio(timeOnTargetMs, list.length * RUN_DURATION_MS),
    mouseSpeed: bySamples((a) => a.mouseSpeed),
  }
}

const byTime = (a: AnalysedRun, b: AnalysedRun) => a.run.startedAt - b.run.startedAt || (a.run.id < b.run.id ? -1 : a.run.id > b.run.id ? 1 : 0)

/** Splits into buckets by key, keeping each bucket's order and ordering the buckets by their first item. */
function partition<K>(items: readonly AnalysedRun[], keyOf: (item: AnalysedRun) => K): Map<K, AnalysedRun[]> {
  const buckets = new Map<K, AnalysedRun[]>()
  for (const item of items) {
    const key = keyOf(item)
    buckets.set(key, [...(buckets.get(key) ?? []), item])
  }
  return buckets
}

/** Pools any set of Runs per Scenario. Warm-up Runs are only counted in `warmups`. Does not depend on the order given. */
export function aggregateRuns(items: readonly AnalysedRun[]): Aggregate {
  const counted = items.filter((i) => !i.run.warmup).sort(byTime)
  return {
    scenarios: [...partition(counted, (i) => i.run.scenario)].map(([scenario, runs]) => {
      const scores = runs.map((r) => r.run.score)
      const analyses = runs.map((r) => r.analysis)
      return {
        scenario,
        runs: runs.length,
        score: { mean: scores.reduce((s, x) => s + x, 0) / scores.length, best: Math.max(...scores) },
        metrics: analyses[0]?.category === 'tracking'
          ? poolTracking(analyses.filter((a) => a.category === 'tracking'))
          : poolClicking(analyses.filter((a) => a.category === 'clicking')),
      }
    }),
    warmups: items.length - counted.length,
  }
}

export interface RunGroup {
  /** What the Runs have in common (a Session id, a day); `undefined` for the Runs the key function had no key for. */
  key: string | undefined
  /** Every Run of the group, Warm-up Runs included (flagged on `run.warmup`), oldest first. */
  runs: AnalysedRun[]
  aggregate: Aggregate
}

/** Groups Runs by `keyOf` and aggregates each group. Groups come in the order of their oldest Run. */
export function groupRuns(items: readonly AnalysedRun[], keyOf: (item: AnalysedRun) => string | undefined): RunGroup[] {
  return [...partition([...items].sort(byTime), keyOf)].map(([key, runs]) => ({ key, runs, aggregate: aggregateRuns(runs) }))
}

/** One group per Session; Runs saved before Sessions existed share one group with key `undefined`. */
export const bySession = (items: readonly AnalysedRun[]): RunGroup[] => groupRuns(items, (i) => i.run.sessionId)

/**
 * One group per day. The core has no clock or time zone, so the shell says what day a start time falls on:
 * `dayOf` returns a label that sorts chronologically, such as the local date as YYYY-MM-DD.
 */
export const byDay = (items: readonly AnalysedRun[], dayOf: (startedAt: number) => string): RunGroup[] =>
  groupRuns(items, (i) => dayOf(i.run.startedAt))
