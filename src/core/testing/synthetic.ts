import { createRng } from '../rng'
import type { Rng } from '../rng'
import type { RunSummary } from '../storage'
import type { Cm360, ScenarioId } from '../types'

/**
 * Synthetic players for the Sensitivity Finder fit (tests only): Finder Session Runs as `RunSummary` records, made without
 * the Scenario engine. A Score is a known function of Sensitivity plus the nuisances the fit has to survive:
 *
 *   score = baseline + scale * ( -curvature * ln(sensitivity / optimum)^2   the true Performance Curve, a parabola in log-Sensitivity
 *                             + trend * (Runs played so far in the Session)   learning
 *                             + form                                      one draw per (Session, Scenario) pair: the day's form
 *                             + noise )                                   one draw per Run
 *
 * `form` and `noise` are standard deviations, all in units of the Scenario's `scale`. Everything is derived from `seed`.
 */

export interface SyntheticScenario {
  /** Score at the optimum before form, trend and noise. */
  baseline: number
  /** The size of one unit in the formula above (the Score's own unit, so Scenarios can differ by orders of magnitude). */
  scale: number
  /** This Scenario's own best Sensitivity; the player's `optimum` when absent. */
  optimum?: Cm360
}

export interface SyntheticPlayer {
  /** The true best Sensitivity (cm/360) that the Curve Peak should recover. */
  optimum: Cm360
  /** Score lost (fraction of `scale`) at an e-fold (x2.72) away from the optimum; the parabola is in ln(Sensitivity). */
  curvature: number
  noise: number
  /** Score gained per Run played in the Session (fraction of `scale`), counting Warm-up Runs. */
  trend: number
  form: number
  /** Score lost by a Warm-up Run (fraction of `scale`): cold hands, which a fit that kept them would feel. */
  warmupPenalty: number
  scenarios: Record<ScenarioId, SyntheticScenario>
}

export const syntheticPlayer = (overrides: Partial<SyntheticPlayer> = {}): SyntheticPlayer => ({
  optimum: 40,
  curvature: 0.8,
  noise: 0.25,
  trend: 0.008,
  form: 0.3,
  warmupPenalty: 1.5,
  scenarios: {
    flick: { baseline: 60, scale: 20 },
    micro: { baseline: 45, scale: 15 },
    strafe: { baseline: 55, scale: 12 },
    switch: { baseline: 30, scale: 8 },
  },
  ...overrides,
})

export interface SyntheticSession {
  /** The Sensitivities each Scenario is played at (one Run each). */
  levels: readonly Cm360[]
  /** Default: Flick and Strafe, one Clicking and one Tracking Scenario. */
  scenarios?: readonly ScenarioId[]
  /** The Session was abandoned: only this many counted Runs (in play order) exist. `RunMeta.levels` still says the planned number. */
  abandonAfter?: number
  /** Where the 2 Warm-up Runs are played; default the geometric middle of `levels`. */
  centre?: Cm360
}

const gauss = (rng: Rng): number => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())

const DAY_MS = 86_400_000
const RUN_MS = 45_000

/**
 * The Runs of `sessions`, one Session per day: 2 Warm-up Runs, then every Scenario of the Session once at every level in a
 * shuffled order (levels of a Scenario share a seed, as in a real Session). Same arguments, same Runs, with unique ids.
 */
export function syntheticRuns(player: SyntheticPlayer, sessions: readonly SyntheticSession[], seed: number): RunSummary[] {
  const rng = createRng(seed)
  return sessions.flatMap((spec, s) => {
    const sessionId = `syn-${seed}-${s}`
    const scenarioIds = spec.scenarios ?? (['flick', 'strafe'] as const)
    const centre = spec.centre ?? Math.exp(spec.levels.reduce((sum, c) => sum + Math.log(c), 0) / spec.levels.length)
    const form = Object.fromEntries(scenarioIds.map((id) => [id, gauss(rng) * player.form]))
    const seeds = Object.fromEntries(scenarioIds.map((id) => [id, Math.floor(rng() * 2 ** 32)]))
    const counted = scenarioIds.flatMap((scenario) => spec.levels.map((sensitivity) => ({ scenario, sensitivity, warmup: false })))
    for (let i = counted.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[counted[i], counted[j]] = [counted[j]!, counted[i]!]
    }
    const warmups = scenarioIds.slice(0, 2).map((scenario) => ({ scenario, sensitivity: centre, warmup: true }))
    const played = [...warmups, ...counted.slice(0, spec.abandonAfter ?? counted.length)]
    return played.map(({ scenario, sensitivity, warmup }, order): RunSummary => {
      const { baseline, scale, optimum = player.optimum } = player.scenarios[scenario]
      const z = Math.log(sensitivity / optimum)
      const unit = -player.curvature * z * z + player.trend * order + form[scenario]! + player.noise * gauss(rng) - (warmup ? player.warmupPenalty : 0)
      return {
        id: `${sessionId}-run${order}`,
        startedAt: s * DAY_MS + order * RUN_MS,
        gameProfileId: 'valorant',
        mode: 'finder',
        warmup,
        sessionId,
        levels: spec.levels.length,
        scenario,
        seed: seeds[scenario]!,
        sensitivity,
        dpi: 800,
        fov: { degrees: 70.5, axis: 'vertical' },
        score: baseline + scale * unit,
      }
    })
  })
}
