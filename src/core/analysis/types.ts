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
  /** Angular distance the crosshair travelled during the movement, in degrees (jitter smoothed out). */
  pathLength: number
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
  /**
   * Mouse speed: how fast the crosshair moves from target appearance to hit, in deg/s (total distance travelled over
   * total time of the Aim Movements). Angular, not cm/s, so it can be compared between Sensitivities.
   */
  mouseSpeed: number
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

/**
 * Whether the crosshair led the target's motion, trailed it, or rode with it (within a small dead zone). Not `Outcome`:
 * Overshoot and Undershoot belong to Aim Movements, and "on-target" there means something else than Time on Target.
 */
export type Lead = 'ahead' | 'behind' | 'level'

/**
 * A Tracking Run. The counts (`samples`, `timeOnTargetMs`) come next to the averages so several Runs can be pooled with
 * the right weights: mean offset and mouse speed by `samples`, time on target by Run length.
 */
export interface TrackingAnalysis {
  category: 'tracking'
  /**
   * Ahead/Behind: mean signed offset of the crosshair from the target along the target's direction of travel, in
   * degrees. Positive is Ahead (leading the motion), negative is Behind (trailing it). 0 when `samples` is 0.
   */
  meanOffset: number
  /** `meanOffset` in plain words (see `leadOf`). `level` when `samples` is 0, so check that first. */
  lead: Lead
  /** The 1 ms steps `meanOffset` and `mouseSpeed` average over: fire held, crosshair within the tracking window of a moving target. */
  samples: number
  /** Time on Target: ms of the Run with the fire button held and the crosshair on a target, the same rule that scores. */
  timeOnTargetMs: number
  /** `timeOnTargetMs` as a share (0 to 1) of the whole Run; x 100 is Strafe's Score. */
  timeOnTargetShare: number
  /**
   * Mouse speed: how fast the crosshair moved over the sampled steps, in deg/s. Angular, not cm/s, so it can be
   * compared between Sensitivities. 0 when `samples` is 0.
   */
  mouseSpeed: number
}

/** The result of analysing one Run, discriminated on the Scenario's category. */
export type RunAnalysis = ClickingAnalysis | TrackingAnalysis
