import { createRng } from '../rng'
import type { Rng } from '../rng'
import { scenarios } from '../scenarios'
import type { Cm360, ScenarioCategory, ScenarioId } from '../types'

/** One Run of a Session plan. The shell turns it into `RunParams` (adding DPI and FOV) and `RunMeta`. */
export interface PlannedRun {
  scenario: ScenarioId
  seed: number
  sensitivity: Cm360
  warmup: boolean
}

/** The coarse phase: `centre x 2^(k/3)` for k = -3 ... 3, so x0.5 to x2 in 7 steps of equal ratio. */
export const coarseLevels = (centre: Cm360): Cm360[] => [-3, -2, -1, 0, 1, 2, 3].map((k) => centre * 2 ** (k / 3))

const CATEGORIES: readonly ScenarioCategory[] = ['clicking', 'tracking']

/**
 * Draws a category by weight, then a Scenario of it uniformly, twice. The second draw skips Scenarios already picked
 * (each is played once per level, so the two must differ) and categories that have none left. With two Scenarios per
 * category that only ever forces the second Scenario within a category, never the category itself, so each draw is
 * a plain weighted draw and the long-run category share equals the weights.
 */
function drawScenarios(weights: Record<ScenarioCategory, number>, rng: Rng): ScenarioId[] {
  const picked: ScenarioId[] = []
  while (picked.length < 2) {
    const free = (c: ScenarioCategory) => scenarios.filter((s) => s.category === c && !picked.includes(s.id))
    const open = CATEGORIES.filter((c) => free(c).length > 0)
    let r = rng() * open.reduce((sum, c) => sum + weights[c], 0)
    const category = open.find((c) => (r -= weights[c]) < 0) ?? open.at(-1) // the fallback only matters when the open weights are all 0
    const pool = category ? free(category) : []
    const chosen = pool[Math.floor(rng() * pool.length)]
    if (!chosen) throw new Error('The registry has fewer than 2 Scenarios to draw from')
    picked.push(chosen.id)
  }
  return picked
}

const nextSeed = (rng: Rng): number => Math.floor(rng() * 2 ** 32)

/**
 * The Run list of one Sensitivity Finder Session, all derived from `seed`.
 *
 * - 2 Warm-up Runs first (never counted): one in each Scenario of the Session, at `centre`, each with a seed of its own
 *   so the counted Runs' target sequence is not rehearsed.
 * - Then every drawn Scenario once at every one of `levels`, shuffled together. All levels of a Scenario share one seed,
 *   so every Sensitivity faces the same target sequence. The two Scenarios have different seeds.
 *
 * `levels` is an input (the coarse phase passes `coarseLevels(centre)`; the fine phase of #11 passes its own).
 */
export function planSession(options: { centre: Cm360; levels: readonly Cm360[]; weights: Record<ScenarioCategory, number>; seed: number }): PlannedRun[] {
  const { centre, levels, weights } = options
  const rng = createRng(options.seed)
  const drawn = drawScenarios(weights, rng)
  const seeds = drawn.map(() => nextSeed(rng))
  const warmups = drawn.map((scenario): PlannedRun => ({ scenario, seed: nextSeed(rng), sensitivity: centre, warmup: true }))
  const counted = drawn.flatMap((scenario, i) =>
    levels.map((sensitivity): PlannedRun => ({ scenario, seed: seeds[i] ?? 0, sensitivity, warmup: false })),
  )
  for (let i = counted.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) // Fisher-Yates
    ;[counted[i], counted[j]] = [counted[j] as PlannedRun, counted[i] as PlannedRun]
  }
  return [...warmups, ...counted]
}
