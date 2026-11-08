import { describe, expect, it } from 'vitest'
import { aggregateRuns, byDay, bySession, createMemoryStore, loadAnalysed, tallyShots } from './index'
import type { AnalysedRun, ClickingAnalysis } from './index'
import { aimBot, missBot, trackBot } from './testing/bots'
import { testRecord } from './testing/records'

const HOUR = 3_600_000
const clicking = (a: AnalysedRun['analysis']): ClickingAnalysis => {
  if (a.category !== 'clicking') throw new Error('expected a Clicking Analysis')
  return a
}

// A clean Run and a sloppy one: different shots, hits and Aim Movement counts, so pooling and averaging disagree.
const clean = () => testRecord({ seed: 1 }, { id: 'clean', startedAt: 0 })
const sloppy = () => testRecord({ seed: 2 }, { id: 'sloppy', startedAt: HOUR }, missBot(aimBot({ gain: 1.3 }), 2))

describe('aggregating Runs from the store', () => {
  it('pools the metrics of a Scenario from counts, not by averaging rates', async () => {
    const store = createMemoryStore()
    const records = [clean(), sloppy()]
    await store.save(records)
    const items = await loadAnalysed(store)
    const { scenarios } = aggregateRuns(items)
    expect(scenarios).toHaveLength(1)
    const flick = scenarios[0]!
    const m = clicking(items[0]!.analysis)
    const n = clicking(items[1]!.analysis)

    // The two Runs really differ, otherwise this test could not tell pooling from averaging.
    expect(m.shots).not.toBe(n.shots)
    expect(m.accuracy).not.toBeCloseTo(n.accuracy, 1)

    const total = records.map((r) => tallyShots(r.targetEvents))
    const hits = total.reduce((s, t) => s + t.hits, 0)
    const shots = total.reduce((s, t) => s + t.shots, 0)
    const moves = items.flatMap((i) => clicking(i.analysis).movements)
    const sum = (pick: (x: (typeof moves)[number]) => number) => moves.reduce((s, x) => s + pick(x), 0)
    const pooled = flick.metrics
    if (pooled.category !== 'clicking') throw new Error('expected Clicking metrics')

    expect(flick.runs).toBe(2)
    expect(pooled.hits).toBe(hits)
    expect(pooled.shots).toBe(shots)
    expect(pooled.accuracy).toBeCloseTo(hits / shots, 10)
    expect(pooled.accuracy).not.toBeCloseTo((m.accuracy + n.accuracy) / 2, 3)
    expect(pooled.movementCount).toBe(moves.length)
    expect(pooled.overshootRate).toBeCloseTo(moves.filter((x) => x.outcome === 'overshoot').length / moves.length, 10)
    expect(pooled.overshootRate).not.toBeCloseTo((m.overshootRate + n.overshootRate) / 2, 3)
    expect(pooled.undershootRate).toBeCloseTo(moves.filter((x) => x.outcome === 'undershoot').length / moves.length, 10)
    expect(pooled.pathDeviation).toBeCloseTo(sum((x) => x.pathDeviation) / moves.length, 10)
    expect(pooled.smoothness).toBeCloseTo(sum((x) => x.velocityPeaks) / moves.length, 10)
    // Mouse speed is distance over time: weighting the Runs' speeds by movement count would be wrong.
    expect(pooled.mouseSpeed).toBeCloseTo(sum((x) => x.pathLength) / (sum((x) => x.endMs - x.startMs) / 1000), 8)
    expect(pooled.mouseSpeed).not.toBeCloseTo((m.mouseSpeed * m.movementCount + n.mouseSpeed * n.movementCount) / moves.length, 3)
    expect(flick.score.mean).toBeCloseTo((records[0]!.score + records[1]!.score) / 2, 10)
    expect(flick.score.best).toBe(Math.max(records[0]!.score, records[1]!.score))
  })

  it('leaves Warm-up Runs out of every metric but counts them', async () => {
    const store = createMemoryStore()
    const warmup = testRecord({ seed: 3 }, { id: 'warm', startedAt: -HOUR, warmup: true }, missBot(aimBot({ gain: 0.7 }), 3))
    await store.save([warmup, clean(), sloppy()])
    const items = await loadAnalysed(store)
    expect(items).toHaveLength(3)
    const withWarmup = aggregateRuns(items)
    const without = aggregateRuns(items.filter((i) => !i.run.warmup))
    expect(withWarmup.warmups).toBe(1)
    expect(without.warmups).toBe(0)
    expect(withWarmup.scenarios).toEqual(without.scenarios)
    expect(withWarmup.scenarios[0]?.runs).toBe(2)
  })

  it('keeps Scenarios apart, in the order they were first played', async () => {
    const store = createMemoryStore()
    await store.save([
      testRecord({ scenario: 'micro', seed: 4 }, { id: 'm1', startedAt: 10 }),
      testRecord({ scenario: 'flick', seed: 5 }, { id: 'f1', startedAt: 20 }),
      testRecord({ scenario: 'micro', seed: 6 }, { id: 'm2', startedAt: 30 }),
    ])
    const { scenarios } = aggregateRuns(await loadAnalysed(store))
    expect(scenarios.map((s) => [s.scenario, s.runs])).toEqual([
      ['micro', 2],
      ['flick', 1],
    ])
  })

  it('gives a Tracking Scenario its Score per Scenario and an empty slot for the Tracking metrics', async () => {
    const store = createMemoryStore()
    const records = [
      testRecord({ scenario: 'strafe', seed: 1 }, { id: 's1', startedAt: 10 }, trackBot()),
      testRecord({ scenario: 'strafe', seed: 2 }, { id: 's2', startedAt: 20 }, trackBot({ leadMs: 300 })),
      testRecord({ scenario: 'switch', seed: 3 }, { id: 'w1', startedAt: 30 }, trackBot()),
    ]
    await store.save(records)
    const { scenarios } = aggregateRuns(await loadAnalysed(store))
    const [strafe, sw] = scenarios
    expect(scenarios.map((s) => [s.scenario, s.runs, s.metrics.category])).toEqual([
      ['strafe', 2, 'tracking'],
      ['switch', 1, 'tracking'],
    ])
    // Strafe is a percentage and Switch a count: each keeps its own unit, they are never mixed.
    expect(records[0]!.score).not.toBe(records[1]!.score)
    expect(strafe?.score.mean).toBeCloseTo((records[0]!.score + records[1]!.score) / 2, 10)
    expect(strafe?.score.best).toBe(Math.max(records[0]!.score, records[1]!.score))
    expect(sw?.score).toEqual({ mean: records[2]!.score, best: records[2]!.score })
  })

  it('aggregates nothing for no Runs', () => {
    expect(aggregateRuns([])).toEqual({ scenarios: [], warmups: 0 })
  })
})

describe('grouping Runs', () => {
  it('summarises per Session and keeps Runs without a Session id together', async () => {
    const store = createMemoryStore()
    await store.save([
      testRecord({ seed: 1 }, { id: 'old', startedAt: 0, sessionId: undefined }),
      testRecord({ seed: 2 }, { id: 'a1', startedAt: HOUR, sessionId: 's1' }),
      testRecord({ scenario: 'micro', seed: 3 }, { id: 'a2', startedAt: 2 * HOUR, sessionId: 's1' }),
      testRecord({ seed: 4 }, { id: 'b1', startedAt: 3 * HOUR, sessionId: 's2', warmup: true }),
    ])
    const groups = bySession(await loadAnalysed(store))
    expect(groups.map((g) => [g.key, g.runs.map((r) => r.run.id)])).toEqual([
      [undefined, ['old']],
      ['s1', ['a1', 'a2']],
      ['s2', ['b1']],
    ])
    expect(groups[1]?.aggregate.scenarios.map((s) => s.scenario)).toEqual(['flick', 'micro'])
    // A Session of only a Warm-up Run still lists the Run but has nothing to compare.
    expect(groups[2]?.aggregate).toEqual({ scenarios: [], warmups: 1 })
  })

  it('does not depend on the order the Runs are given in', async () => {
    const store = createMemoryStore()
    await store.save([clean(), sloppy()])
    const items = await loadAnalysed(store)
    expect(bySession([...items].reverse())).toEqual(bySession(items))
  })

  it('puts a Run played after local midnight in the next day, whatever the UTC day', async () => {
    // Local time is UTC-5. 03:00 and 06:00 UTC are the same UTC day but 22:00 and 01:00 local: two days.
    const offset = -5 * HOUR
    const localDay = (t: number) => String(Math.floor((t + offset) / (24 * HOUR)))
    const day = 20_000 * 24 * HOUR
    const store = createMemoryStore()
    await store.save([
      testRecord({ seed: 1 }, { id: 'late-evening', startedAt: day + 3 * HOUR }),
      testRecord({ seed: 2 }, { id: 'after-midnight', startedAt: day + 6 * HOUR }),
      testRecord({ seed: 3 }, { id: 'same-night', startedAt: day + 7 * HOUR }),
    ])
    const items = await loadAnalysed(store)
    const days = byDay(items, localDay)
    expect(days.map((d) => d.runs.map((r) => r.run.id))).toEqual([['late-evening'], ['after-midnight', 'same-night']])
    expect(Number(days[1]?.key) - Number(days[0]?.key)).toBe(1)
    // The same Runs under a UTC clock share one day.
    expect(byDay(items, (t) => String(Math.floor(t / (24 * HOUR))))).toHaveLength(1)
  })
})

describe('loading analysed Runs', () => {
  it('filters like the store does and skips a Run whose Scenario this build does not know', async () => {
    const store = createMemoryStore()
    await store.save([
      testRecord({ seed: 1 }, { id: 'a', sessionId: 's1' }),
      testRecord({ seed: 2 }, { id: 'b', sessionId: 's2' }),
      { ...testRecord({ seed: 3 }, { id: 'future', sessionId: 's1' }), scenario: 'from-the-future' } as never,
    ])
    expect((await loadAnalysed(store, { sessionId: 's1' })).map((i) => i.run.id)).toEqual(['a'])
    expect((await loadAnalysed(store)).map((i) => i.run.id)).toEqual(['a', 'b'])
  })
})
