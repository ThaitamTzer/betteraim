import { angleBetween } from '../aim'
import { createRng } from '../rng'
import type { Rules, ScenarioDefinition } from '../scenario'
import type { Target, TargetEvent } from '../types'
import { createWander } from './wander'

const RADIUS_DEG = 2

/**
 * Strafe (Tracking): one target that sways left and right (up to about 24 degrees either side, peaking near 50 degrees
 * per second) and drifts a little up and down, changing direction smoothly. The player holds fire; Score is the
 * percentage of the Run so far that the fire button was held with the crosshair on the target (1 ms steps).
 */
export const strafe: ScenarioDefinition = {
  id: 'strafe',
  category: 'tracking',
  name: 'Strafe',
  description: 'One target that moves and changes direction. Hold fire and keep the crosshair on it.',
  rules(seed): Rules {
    const motion = createWander(createRng(seed), { yaw: 0, pitch: 0 }, {
      yaw: [
        { amplitude: 18, minPeriodS: 3.5, maxPeriodS: 5.5 },
        { amplitude: 6, minPeriodS: 2, maxPeriodS: 3 },
      ],
      pitch: [{ amplitude: 5, minPeriodS: 3, maxPeriodS: 5 }],
    })
    const at = (t: number): Target => ({ id: 0, radius: RADIUS_DEG, ...motion(t) })
    const start = at(0)
    const events: TargetEvent[] = [
      { kind: 'spawn', t: 0, id: 0, yaw: start.yaw, pitch: start.pitch, radius: RADIUS_DEG, crosshair: { yaw: 0, pitch: 0 } },
    ]
    let targets: readonly Target[] = [start]
    let elapsed = 0
    let onMs = 0

    return {
      get targets() {
        return targets
      },
      events,
      get score() {
        return elapsed === 0 ? 0 : (100 * onMs) / elapsed
      },
      step(t, aim, held) {
        elapsed = t
        const target = at(t)
        targets = [target]
        if (held && angleBetween(aim, target) <= RADIUS_DEG) onMs++
      },
    }
  },
}
