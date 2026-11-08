import { getScenario } from '../scenarios'
import type { RunSummary } from '../storage'
import type { ScenarioCategory } from '../types'

/**
 * An independent, brute-force version of the Finder model (tests only), to check the fit against: explicit dummy columns for the
 * (Session, Scenario) pairs, explicit category weights, solved by Gaussian elimination. It shares nothing with finder/model.ts.
 */

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

type Row = { x: number[]; y: number; w: number }
function leastSquares(rows: Row[]): number[] {
  const p = rows[0]!.x.length
  const a = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r.w * r.x[i]! * r.x[j]!, 0)))
  const c = Array.from({ length: p }, (_, i) => rows.reduce((s, r) => s + r.w * r.x[i]! * r.y, 0))
  for (let col = 0; col < p; col++) {
    const pivot = a.map((row, i) => [Math.abs(row[col]!), i] as const).filter(([, i]) => i >= col).sort((u, v) => v[0] - u[0])[0]![1]
    ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
    ;[c[col], c[pivot]] = [c[pivot]!, c[col]!]
    for (let i = col + 1; i < p; i++) {
      const f = a[i]![col]! / a[col]![col]!
      for (let j = col; j < p; j++) a[i]![j]! -= f * a[col]![j]!
      c[i]! -= f * c[col]!
    }
  }
  const beta = Array<number>(p).fill(0)
  for (let i = p - 1; i >= 0; i--) beta[i] = (c[i]! - a[i]!.slice(i + 1).reduce((s, v, k) => s + v * beta[i + 1 + k]!, 0)) / a[i]![i]!
  return beta
}

/** The spec's model on complete, non-warm-up Finder Runs: peak (cm/360) of the quadratic, with `pairMeans` choosing between the pair offsets and the biased pair-mean subtraction. */
export function referencePeak(runs: RunSummary[], target: Record<ScenarioCategory, number>, pairMeans = false): number {
  const used = runs.filter((r) => r.mode === 'finder' && !r.warmup)
  const order = new Map<string, number>()
  for (const id of new Set(runs.map((r) => r.sessionId))) runs.filter((r) => r.sessionId === id).sort((a, b) => a.startedAt - b.startedAt).forEach((r, i) => order.set(r.id, i))
  const spread = (scenario: string) => {
    const ys = used.filter((r) => r.scenario === scenario).map((r) => r.score)
    return Math.sqrt(ys.reduce((s, y) => s + (y - mean(ys)) ** 2, 0) / (ys.length - 1))
  }
  const share = (c: string) => used.filter((r) => getScenario(r.scenario).category === c).length / used.length
  const pairOf = (r: RunSummary) => `${r.sessionId}/${r.scenario}`
  const pairs = [...new Set(used.map(pairOf))]
  const x0 = mean(used.map((r) => Math.log(r.sensitivity)))
  const rows = used.map((r): Row => {
    const category = getScenario(r.scenario).category
    const u = Math.log(r.sensitivity) - x0
    const y = r.score / spread(r.scenario)
    const pairMean = mean(used.filter((o) => pairOf(o) === pairOf(r)).map((o) => o.score / spread(o.scenario)))
    return {
      x: [u, u * u, order.get(r.id)!, ...(pairMeans ? [1] : pairs.map((p) => (p === pairOf(r) ? 1 : 0)))],
      y: pairMeans ? y - pairMean : y,
      w: target[category] / share(category),
    }
  })
  const [b, q] = leastSquares(rows) as [number, number]
  return Math.exp(x0 - b / (2 * q))
}
