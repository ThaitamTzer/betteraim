import { createRng } from '../rng'
import { getScenario } from '../scenarios'
import type { RunSummary } from '../storage'
import type { Cm360, ScenarioCategory, ScenarioId } from '../types'

/**
 * The Sensitivity Finder's statistical model (spec #1, "Model"): the Performance Curve, the Curve Peak and its confidence
 * interval, from Finder Runs. Pure and deterministic: the same Runs always give the same result, interval included.
 *
 * 1. Scale: each Scenario's Score is divided by that Scenario's standard deviation over all fitted Runs of it in the Game Profile
 *    (never per pair: a pair's spread depends on which levels it happened to play).
 * 2. Fit: scaled Score = quadratic in ln(Sensitivity) + a run-order term + a separate offset (dummy variable) for every
 *    (Session, Scenario) pair. The offsets are absorbed exactly: demeaning every regressor AND the Score inside each pair gives the
 *    same slopes as explicit dummies (Frisch-Waugh-Lovell). Demeaning only the Score would bias the curve when coarse and fine
 *    Sessions are pooled, and is not what this does. The 3 remaining slopes come from a Cholesky solve.
 * 3. Weights: every Run counts (its category's target share) / (that category's actual share of the fitted Runs), once.
 *    Scenarios are already drawn by these weights, so using them as they are would double-count (70/30 would become 84/16).
 * 4. Curve Peak: the vertex of the quadratic, in cm/360, if it is a maximum inside the tested range.
 * 5. Interval: percentile bootstrap over Sessions (5th to 95th percentile), stretched for few Sessions (see `stretch`). Resampling a
 *    Session takes all of its pairs, and the whole pipeline (spread, weights, fit) is redone on each resample. A resample's peak
 *    that is not an interior maximum counts as the edge of the tested range it points to, so a fit that cannot find its peak
 *    widens the interval instead of being skipped. The seed comes from the Runs, so the same data gives the same interval.
 */

/**
 * Bootstrap resamples. The sufficient statistics of every pair are computed once (see `Pair`), so a resample costs a few
 * microseconds per pair: 2000 of them take about 10 ms for 10 Sessions, and the 5th/95th percentiles stay stable to well under 1%.
 */
export const BOOTSTRAP_RESAMPLES = 2000
/** Central interval of the bootstrap peaks: 5th to 95th percentile. */
export const INTERVAL_LEVEL = 0.9
/** "Enough data": an interval whose half-width is narrower than this share of the peak (spec: +-10%). */
export const ENOUGH_HALF_WIDTH = 0.1
const CURVE_POINTS = 61

// Resampling S Sessions under-states the spread of the peak (the bootstrap variance of S clusters is (S-1)/S of the sample's) and,
// with few Sessions, the peak's distribution has the heavy tails of a Student t. A plain percentile interval from 3 Sessions
// covered the true optimum about half the time, so it is stretched about the estimate by sqrt(S/(S-1)) x t/z, with t and z the
// 95th percentiles of Student's t on S-1 degrees of freedom and of the normal (right for INTERVAL_LEVEL 0.9; t for df > 10 is a fit).
const T95 = [6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812]
const stretch = (sessions: number): number => {
  const df = sessions - 1
  return Math.sqrt(sessions / df) * ((T95[df - 1] ?? 1.645 + 1.6 / df) / 1.645)
}

export interface FitOptions {
  /** The Game Profile's Clicking/Tracking target shares. A category with no Runs is left out and the rest renormalised, so a fit of one category weighs everything 1. */
  weights: Record<ScenarioCategory, number>
  /** Runs this returns true for are left out of the fit (Reset Finder, ticket #11: `(run) => run.startedAt < resetAt`). Pairs it leaves incomplete are left out too. */
  exclude?: (run: RunSummary) => boolean
}

/** Why there is no Curve Peak. `no-interior-peak`: the curve is a valley, or its top lies outside `range`; the higher end of `curve` is the side it points to. */
export type FitReason = 'insufficient-data' | 'no-interior-peak'

export interface FinderFit {
  /** The Curve Peak in cm/360, or null (then `reason` says why). */
  peak: Cm360 | null
  reason: FitReason | null
  /** Bootstrap interval of the peak (central `INTERVAL_LEVEL`), clamped to `range`. `halfWidth` = (high - low) / 2 / peak. Null without a peak or with fewer than 2 Sessions. */
  interval: { low: Cm360; high: Cm360; halfWidth: number } | null
  /** The interval is narrower than +-10% of the peak. */
  enoughData: boolean
  /** The tested Sensitivities: lowest and highest of the fitted Runs. Null when nothing was fitted. */
  range: { min: Cm360; max: Cm360 } | null
  /** The fitted curve on a log-spaced grid over `range`. `score` is in spreads of the Scenario (the scaled Score) relative to the highest point of the curve, so 0 is the top. Empty when nothing could be fitted. */
  curve: { sensitivity: Cm360[]; score: number[] }
  /** What was played, on the same axes as `curve`: per distinct Sensitivity, the mean scaled Score of its Runs with the pair offsets and run-order effect taken out. */
  points: { sensitivity: Cm360; score: number; runs: number }[]
  /**
   * The fitted slopes, in x = (ln(Sensitivity) - `centre`) / `halfRange` (so `range` is x in [-1, 1]) and the scaled Score:
   * curve(x) = linear * x + quadratic * x^2 (+ an offset per pair), and `order` is the Score per Run played in the Session.
   */
  coefficients: { centre: number; halfRange: number; linear: number; quadratic: number; order: number } | null
  /** One per fitted pair: the scaled Score at the top of the curve at the start of the Session; differences are day-to-day form and Scenario level. */
  offsets: { sessionId: string; scenario: ScenarioId; offset: number }[]
  /** The standard deviation each fitted Scenario's Score was divided by. */
  spread: Partial<Record<ScenarioId, number>>
  counts: {
    sessions: number
    pairs: number
    /** Runs in the fit. */
    runs: number
    excluded: { warmup: number; practice: number; filtered: number; incompletePair: number }
  }
}

/** The Sensitivity to recommend. This is the seam of ticket #15: the AI Coach's choice inside `fit.interval` goes here; today it is the Curve Peak. */
export const recommend = (fit: FinderFit): Cm360 | null => fit.peak

interface Row {
  sensitivity: Cm360
  /** Position of the Run in its Session (0 = first Run played, Warm-up Runs included when given). */
  order: number
  score: number
}

/**
 * One (Session, Scenario) pair, reduced to the statistics a fit needs, so a bootstrap resample never touches Runs again.
 * With x = (u, u^2, order) demeaned inside the pair: `gram` = sum of x x^T (upper triangle: uu, uq, ut, qq, qt, tt) and
 * `xy` = sum of x * Score. Both are exact because the pair's own offset absorbs the means. Scaling the Score only scales `xy`.
 */
interface Pair {
  sessionId: string
  scenario: ScenarioId
  category: ScenarioCategory
  rows: Row[]
  n: number
  meanScore: number
  /** Sum of squares of the Score around `meanScore`. */
  scoreSS: number
  gram: [number, number, number, number, number, number]
  xy: [number, number, number]
  /** Means of u, u^2 and order, to recover the offset. */
  means: [number, number, number]
}

const keyOf = (run: RunSummary): string => `${run.sessionId}\u0000${run.scenario}`

/** FNV-1a over the fitted Runs in id order: the seed of the bootstrap, so the same data always gives the same interval. */
function hashRuns(rows: readonly { id: string; sensitivity: number; score: number }[]): number {
  let h = 2166136261
  for (const r of [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    for (const ch of `${r.id}|${r.sensitivity}|${r.score};`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  }
  return h >>> 0
}

/** Solves the symmetric 3x3 system (upper triangle `a`) by Cholesky; null when it is not positive definite (collinear regressors). */
function solve3(a: readonly number[], c: readonly number[]): [number, number, number] | null {
  const [a00, a01, a02, a11, a12, a22] = a as [number, number, number, number, number, number]
  const tiny = 1e-9
  if (!(a00 > 0) || !(a11 > 0) || !(a22 > 0)) return null
  const l00 = Math.sqrt(a00)
  const l10 = a01 / l00
  const l20 = a02 / l00
  const d1 = a11 - l10 * l10
  if (!(d1 > tiny * a11)) return null
  const l11 = Math.sqrt(d1)
  const l21 = (a12 - l20 * l10) / l11
  const d2 = a22 - l20 * l20 - l21 * l21
  if (!(d2 > tiny * a22)) return null
  const l22 = Math.sqrt(d2)
  const z0 = c[0]! / l00
  const z1 = (c[1]! - l10 * z0) / l11
  const z2 = (c[2]! - l20 * z0 - l21 * z1) / l22
  const x2 = z2 / l22
  const x1 = (z1 - l21 * x2) / l11
  const x0 = (z0 - l10 * x1 - l20 * x2) / l00
  return [x0, x1, x2]
}

interface Solution {
  /** Slopes of u, u^2 and order, on the scaled Score. */
  beta: [number, number, number]
  spread: Map<ScenarioId, number>
}

/** Steps 1 to 3 on a list of pairs (the data, or a bootstrap resample of it). Null when the slopes are not identified. */
function solve(pairs: readonly Pair[], target: Record<ScenarioCategory, number>): Solution | null {
  const spread = new Map<ScenarioId, number>()
  const sums = new Map<ScenarioId, { n: number; sum: number }>()
  const counts: Record<ScenarioCategory, number> = { clicking: 0, tracking: 0 }
  let total = 0
  for (const p of pairs) {
    const s = sums.get(p.scenario) ?? { n: 0, sum: 0 }
    s.n += p.n
    s.sum += p.n * p.meanScore
    sums.set(p.scenario, s)
    counts[p.category] += p.n
    total += p.n
  }
  const ss = new Map<ScenarioId, number>()
  for (const p of pairs) {
    const s = sums.get(p.scenario)!
    const d = p.meanScore - s.sum / s.n
    ss.set(p.scenario, (ss.get(p.scenario) ?? 0) + p.scoreSS + p.n * d * d)
  }
  for (const [id, s] of sums) {
    const sd = Math.sqrt((ss.get(id) ?? 0) / (s.n - 1))
    spread.set(id, sd > 0 && Number.isFinite(sd) ? sd : 1)
  }
  const present = (['clicking', 'tracking'] as const).filter((c) => counts[c] > 0)
  const share = present.reduce((sum, c) => sum + Math.max(0, target[c]), 0)
  const weightOf = (c: ScenarioCategory): number => (share > 0 ? Math.max(0, target[c]) / share / (counts[c] / total) : 1)

  const a = [0, 0, 0, 0, 0, 0]
  const c = [0, 0, 0]
  for (const p of pairs) {
    const w = weightOf(p.category)
    const sd = spread.get(p.scenario)!
    for (let i = 0; i < 6; i++) a[i]! += w * p.gram[i]!
    for (let i = 0; i < 3; i++) c[i]! += (w * p.xy[i]!) / sd
  }
  const beta = solve3(a, c)
  return beta && { beta, spread }
}

/**
 * Where the top of the curve b*u + q*u^2 is on u in [-1, 1] (the tested range), and whether it is an interior maximum.
 * A valley or a top outside the range gives the edge it points to, which is what the bootstrap counts.
 */
function top([b, q]: readonly number[]): { u: number; interior: boolean } {
  if (q! < 0) {
    const u = -b! / (2 * q!)
    return { u: Math.max(-1, Math.min(1, u)), interior: Math.abs(u) < 1 }
  }
  return { u: b! >= 0 ? 1 : -1, interior: false }
}

const quantile = (sorted: readonly number[], p: number): number => {
  const x = p * (sorted.length - 1)
  const lo = Math.floor(x)
  return sorted[lo]! + (x - lo) * ((sorted[lo + 1] ?? sorted[lo]!) - sorted[lo]!)
}

const EMPTY: Omit<FinderFit, 'counts'> = {
  peak: null,
  reason: 'insufficient-data',
  interval: null,
  enoughData: false,
  range: null,
  curve: { sensitivity: [], score: [] },
  points: [],
  coefficients: null,
  offsets: [],
  spread: {},
}

/**
 * Fits the Performance Curve to Finder Runs of ONE Game Profile (the caller filters; this also leaves out Warm-up Runs, Practice Runs,
 * what `options.exclude` says and every (Session, Scenario) pair with fewer counted Runs than `RunMeta.levels`). Never throws:
 * too little data gives `peak: null` with a `reason`. To fit one category (per-category curves), pass only its Runs.
 */
export function fitFinder(runs: readonly RunSummary[], options: FitOptions): FinderFit {
  const excluded = { warmup: 0, practice: 0, filtered: 0, incompletePair: 0 }

  // Run order is the rank inside the Session among every Run given, before anything is excluded: a gap left by an excluded Run is real time.
  const order = new Map<string, number>()
  const bySession = new Map<string, RunSummary[]>()
  for (const r of runs) if (r.mode === 'finder' && r.sessionId !== undefined) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r])
  for (const list of bySession.values()) {
    list.sort((x, y) => x.startedAt - y.startedAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).forEach((r, i) => order.set(r.id, i))
  }

  const grouped = new Map<string, RunSummary[]>()
  for (const r of runs) {
    if (r.mode !== 'finder') excluded.practice++
    else if (r.warmup) excluded.warmup++
    else if (options.exclude?.(r)) excluded.filtered++
    else if (r.sessionId === undefined) excluded.incompletePair++
    else grouped.set(keyOf(r), [...(grouped.get(keyOf(r)) ?? []), r])
  }
  const kept: RunSummary[][] = []
  for (const list of grouped.values()) {
    const planned = list.find((r) => r.levels !== undefined)?.levels
    if (planned !== undefined && list.length < planned) excluded.incompletePair += list.length
    else kept.push(list.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) // a canonical order makes the floats, not just the maths, independent of input order
  }

  const used = kept.flat()
  const sessions = new Set(used.map((r) => r.sessionId)).size
  const counts = { sessions, pairs: kept.length, runs: used.length, excluded }
  const lns = used.map((r) => Math.log(r.sensitivity))
  const lo = Math.min(...lns)
  const hi = Math.max(...lns)
  if (used.length === 0 || !(hi > lo)) return { ...EMPTY, ...(used.length > 0 && { range: { min: Math.exp(lo), max: Math.exp(hi) } }), counts }

  const centre = (lo + hi) / 2
  const halfRange = (hi - lo) / 2
  const pairs = kept
    .map((list): Pair => {
      const rows = list.map((r): Row => ({ sensitivity: r.sensitivity, order: order.get(r.id)!, score: r.score }))
      const n = rows.length
      const u = rows.map((r) => (Math.log(r.sensitivity) - centre) / halfRange)
      const x = rows.map((r, i) => [u[i]!, u[i]! * u[i]!, r.order] as const)
      const means = [0, 1, 2].map((k) => x.reduce((sum, row) => sum + row[k]!, 0) / n) as Pair['means']
      const meanScore = rows.reduce((sum, r) => sum + r.score, 0) / n
      const gram: Pair['gram'] = [0, 0, 0, 0, 0, 0]
      const xy: Pair['xy'] = [0, 0, 0]
      let scoreSS = 0
      rows.forEach((r, i) => {
        const d = [x[i]![0] - means[0], x[i]![1] - means[1], x[i]![2] - means[2]] as const
        gram[0] += d[0] * d[0]
        gram[1] += d[0] * d[1]
        gram[2] += d[0] * d[2]
        gram[3] += d[1] * d[1]
        gram[4] += d[1] * d[2]
        gram[5] += d[2] * d[2]
        for (let k = 0; k < 3; k++) xy[k]! += d[k]! * (r.score - meanScore)
        scoreSS += (r.score - meanScore) ** 2
      })
      const first = list[0]!
      return { sessionId: first.sessionId!, scenario: first.scenario, category: getScenario(first.scenario).category, rows, n, meanScore, scoreSS, gram, xy, means }
    })
    .sort((p, q) => (p.sessionId < q.sessionId ? -1 : p.sessionId > q.sessionId ? 1 : p.scenario < q.scenario ? -1 : 1))

  const range = { min: Math.exp(lo), max: Math.exp(hi) }
  const solution = used.length - pairs.length - 3 >= 1 ? solve(pairs, options.weights) : null
  if (!solution) return { ...EMPTY, range, counts }
  const { beta, spread } = solution
  const [b, q, r] = beta
  const at = (u: number): number => b * u + q * u * u

  // The curve and what was played, relative to the top of the curve on the grid.
  const grid = Array.from({ length: CURVE_POINTS }, (_, k) => -1 + (2 * k) / (CURVE_POINTS - 1))
  const shift = Math.max(...grid.map(at))
  const curve = { sensitivity: grid.map((u) => Math.exp(centre + halfRange * u)), score: grid.map((u) => at(u) - shift) }
  const offsets = pairs.map((p) => {
    const sd = spread.get(p.scenario)!
    return { sessionId: p.sessionId, scenario: p.scenario, offset: p.meanScore / sd - b * p.means[0] - q * p.means[1] - r * p.means[2] + shift }
  })
  const level = new Map<string, { sensitivity: number; sum: number; runs: number }>()
  pairs.forEach((p, i) => {
    const sd = spread.get(p.scenario)!
    for (const row of p.rows) {
      const key = String(row.sensitivity)
      const cell = level.get(key) ?? { sensitivity: row.sensitivity, sum: 0, runs: 0 }
      cell.sum += row.score / sd - (offsets[i]!.offset - shift) - r * row.order
      cell.runs++
      level.set(key, cell)
    }
  })
  const points = [...level.values()].sort((x, y) => x.sensitivity - y.sensitivity).map((c) => ({ sensitivity: c.sensitivity, score: c.sum / c.runs - shift, runs: c.runs }))

  const found = top(beta)
  const base = {
    range,
    curve,
    points,
    coefficients: { centre, halfRange, linear: b, quadratic: q, order: r },
    offsets,
    spread: Object.fromEntries(spread) as Partial<Record<ScenarioId, number>>,
    counts,
  }
  if (!found.interior) return { ...base, peak: null, reason: 'no-interior-peak', interval: null, enoughData: false }

  const peak = Math.exp(centre + halfRange * found.u)
  if (sessions < 2) return { ...base, peak, reason: null, interval: null, enoughData: false }

  // Percentile bootstrap over Sessions, seeded by the data itself.
  const bySessionPairs = new Map<string, Pair[]>()
  for (const p of pairs) bySessionPairs.set(p.sessionId, [...(bySessionPairs.get(p.sessionId) ?? []), p])
  const sessionPairs = [...bySessionPairs.values()]
  const rng = createRng(hashRuns(used))
  const tops: number[] = []
  for (let i = 0; i < BOOTSTRAP_RESAMPLES; i++) {
    const resample = Array.from({ length: sessionPairs.length }, () => sessionPairs[Math.floor(rng() * sessionPairs.length)]!).flat()
    const s = solve(resample, options.weights)
    if (s) tops.push(top(s.beta).u)
  }
  if (tops.length < BOOTSTRAP_RESAMPLES / 2) return { ...base, peak, reason: null, interval: null, enoughData: false }
  tops.sort((x, y) => x - y)
  const edge = (1 - INTERVAL_LEVEL) / 2
  const k = stretch(sessions)
  const bound = (p: number): number => Math.exp(centre + halfRange * Math.max(-1, Math.min(1, found.u + k * (quantile(tops, p) - found.u))))
  const low = Math.min(peak, bound(edge))
  const high = Math.max(peak, bound(1 - edge))
  const halfWidth = (high - low) / 2 / peak
  return { ...base, peak, reason: null, interval: { low, high, halfWidth }, enoughData: halfWidth < ENOUGH_HALF_WIDTH }
}
