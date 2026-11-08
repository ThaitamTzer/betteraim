import { createClickingScenario } from './clicking'

/** Micro (Clicking): small targets 2-10 degrees from the crosshair, a radius well under Flick's 2. */
export const micro = createClickingScenario({
  id: 'micro',
  name: 'Micro',
  description: 'Small targets close to the crosshair. Train precise small adjustments.',
  minDeg: 2,
  maxDeg: 10,
  radiusDeg: 0.75,
})
