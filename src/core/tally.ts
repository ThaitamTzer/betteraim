import type { TargetEvent } from './types'

/** Shot counts of a Clicking Run, for the result screen and Analysis. `accuracy` is 0 when no shot was fired. */
export const tallyShots = (events: readonly TargetEvent[]) => {
  let hits = 0
  let shots = 0
  for (const e of events) {
    if (e.kind !== 'shot') continue
    shots++
    if (e.id !== null) hits++
  }
  return { hits, shots, accuracy: shots === 0 ? 0 : hits / shots }
}
