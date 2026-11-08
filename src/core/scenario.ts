import type { Aim, ScenarioCategory, ScenarioId, Target, TargetEvent } from './types'

// They live here, not in run.ts: Scenario files may import them, and run.ts imports the Scenario registry,
// so importing run.ts from a Scenario file would be a cycle.
export const RUN_DURATION_MS = 30_000
/** Simulated time advances in whole steps of this size, so results do not depend on the tick rate. */
export const STEP_MS = 1

/**
 * What one Scenario implements. The Run engine (run.ts) owns time, the crosshair, input and the record;
 * Rules own the targets, the target event log and the Score. Create one Rules per Run.
 *
 * The crosshair starts at yaw 0, pitch 0. All sizes, distances and speeds are in degrees and must not
 * depend on Sensitivity, DPI or FOV. Randomness comes only from `createRng(seed)` and the number of draws
 * must not depend on the player's input (Finder Runs share a seed across Sensitivities).
 */
export interface Rules {
  /** Targets alive now. Replace the array on change; do not mutate it. */
  readonly targets: readonly Target[]
  /** Append-only log of everything that happened to targets. */
  readonly events: readonly TargetEvent[]
  /** Score so far (final when the Run ends). */
  readonly score: number
  /** The fire button went down at `t` with the crosshair at `aim`. Clicking Scenarios use this. */
  shoot?(t: number, aim: Aim): void
  /**
   * Called once per STEP_MS of simulated time (t = 1, 2, 3, ... ms) whatever the tick rate, with the
   * crosshair as it is then and whether the fire button is held. Tracking Scenarios move targets and
   * count time on target here, so their result cannot depend on how often the shell ticks.
   */
  step?(t: number, aim: Aim, held: boolean): void
}

export interface ScenarioDefinition {
  id: ScenarioId
  category: ScenarioCategory
  /** Label and one-line description for the Practice picker. */
  name: string
  description: string
  rules(seed: number): Rules
}
