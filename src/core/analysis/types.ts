import type { RunParams, RunResult } from '../types'

/** What Analysis reads: a Run's params plus what the Run produced. A `RunRecord` fits. */
export type RunData = RunParams & Pick<RunResult, 'input' | 'targetEvents'>

/** Where an Aim Movement's Primary Submovement ended relative to the target's near and far edges along the Ideal Path. */
export type Outcome = 'overshoot' | 'undershoot' | 'on-target'

/** One Aim Movement of a Clicking Run: from target appearance to the hit that killed the target. */
export interface AimMovement {
  targetId: number
  /** ms since Run start: when the target appeared and when the hit landed. */
  startMs: number
  endMs: number
  /** Length of the Ideal Path: crosshair at target appearance to the target centre, in degrees. */
  idealDistance: number
  /** Where the Primary Submovement ended, in degrees along the Ideal Path from its start (past `idealDistance` is beyond the centre). */
  primaryEndAlong: number
  outcome: Outcome
  /** Mean perpendicular angular distance from the Ideal Path in degrees, over the path travelled. */
  pathDeviation: number
  /** Peaks of the velocity profile: one clean push is 1, every correction adds one. */
  velocityPeaks: number
}

export interface ClickingAnalysis {
  category: 'clicking'
  /** Completed Aim Movements in order; a target still alive when the Run ended has none. */
  movements: readonly AimMovement[]
  /** Counts come next to the rates so several Runs can be pooled with the right weights. */
  movementCount: number
  shots: number
  hits: number
  /** hits / shots, 0 when no shot was fired. */
  accuracy: number
  /** Aim Movements whose Primary Submovement was an Overshoot / an Undershoot (of `movementCount`). */
  overshoots: number
  undershoots: number
  /** overshoots / movementCount, 0 when there are no Aim Movements. */
  overshootRate: number
  undershootRate: number
  /** Path Deviation: mean of the Aim Movements' Path Deviation, in degrees. */
  pathDeviation: number
  /** Smoothness: mean velocity peaks per Aim Movement (fewer is smoother), 0 when there are none. */
  smoothness: number
}

/** Ticket #8 adds the Tracking metrics (Ahead/Behind, time on target). */
export interface TrackingAnalysis {
  category: 'tracking'
}

/** The result of analysing one Run, discriminated on the Scenario's category. */
export type RunAnalysis = ClickingAnalysis | TrackingAnalysis
