import type { Cm360 } from '../types'
import { pointsTo } from './model'
import type { FinderFit } from './model'
import { coarseLevels } from './plan'

/** The fine phase starts once the interval's half-width (relative to the peak) is narrower than this (spec: +-25%). */
export const FINE_HALF_WIDTH = 0.25
/** The fine phase's levels run from `1 - FINE_SPREAD` to `1 + FINE_SPREAD` times the Curve Peak (spec: +-20%). */
export const FINE_SPREAD = 0.2
const FINE_LEVELS = 5

/**
 * Why the next Session looks as it does. `start`: nothing to go on, so the player's own Sensitivity. `coarse`: a peak, but the interval is
 * not narrower than +-25% yet. `fine`: it is. `shift-higher` / `shift-lower`: no interior peak, the range moves towards that cm/360 end.
 */
export type NextReason = 'start' | 'coarse' | 'fine' | 'shift-higher' | 'shift-lower'

export interface NextSession {
  phase: 'coarse' | 'fine'
  centre: Cm360
  /** `coarseLevels(centre)` (7) or the fine phase's 5. What `planSession` is given and `RunMeta.levels` counts. */
  levels: Cm360[]
  reason: NextReason
}

/**
 * What the next Finder Session of a Game Profile does, from its fit alone (pure, so the Centre needs no stored state). `fallbackCentre` is the
 * player's current Sensitivity, used only while there is nothing to go on.
 * - No curve to speak of: coarse, centred on `fallbackCentre`.
 * - Interior peak: the Centre is the Curve Peak. Coarse while `interval.halfWidth >= 0.25` (or there is no interval yet), so a shift made earlier
 *   is not undone by going back to the player's Sensitivity. Fine below that: 5 log-spaced levels from peak x 0.8 to peak x 1.2 (the middle one is
 *   the geometric mean, peak x 0.98).
 * - No interior peak: coarse, centred on the edge of the tested range that the higher end of the curve points to. The coarse range is x0.5 to x2
 *   around its Centre, so the old edge is the middle level of the new range and 4 of the 7 levels were played before (a pooled fit needs the overlap).
 */
export function nextSession(fit: FinderFit, fallbackCentre: Cm360): NextSession {
  const coarse = (centre: Cm360, reason: NextReason): NextSession => ({ phase: 'coarse', centre, levels: coarseLevels(centre), reason })
  if (fit.reason === 'no-interior-peak' && fit.range) {
    const higher = pointsTo(fit) === 'higher'
    return coarse(higher ? fit.range.max : fit.range.min, higher ? 'shift-higher' : 'shift-lower')
  }
  const { peak, interval } = fit
  if (peak === null) return coarse(fallbackCentre, 'start')
  if (!interval || interval.halfWidth >= FINE_HALF_WIDTH) return coarse(peak, 'coarse')
  const low = peak * (1 - FINE_SPREAD)
  const ratio = (1 + FINE_SPREAD) / (1 - FINE_SPREAD)
  return { phase: 'fine', centre: peak, levels: Array.from({ length: FINE_LEVELS }, (_, i) => low * ratio ** (i / (FINE_LEVELS - 1))), reason: 'fine' }
}
