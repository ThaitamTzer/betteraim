import { createClickingScenario } from './clicking'

/** Flick (Clicking): one target at a time, 10-60 degrees from the crosshair. */
export const flick = createClickingScenario({
  id: 'flick',
  name: 'Flick',
  description: 'One target at a time at wide angles. Train big, fast flicks.',
  minDeg: 10,
  maxDeg: 60,
  radiusDeg: 2,
})
