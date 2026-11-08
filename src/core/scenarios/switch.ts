import { angleBetween } from '../aim'
import { createRng } from '../rng'
import type { Rules, ScenarioDefinition } from '../scenario'
import type { Target, TargetEvent } from '../types'
import { createWander } from './wander'

const RADIUS_DEG = 2
/** On-target time (fire held, crosshair on the target, summed over the Run, not reset by looking away) that makes a target fall. */
const FALL_MS = 400
// Targets drift around one of these yaw positions, 24 degrees apart, so two never overlap. Three are alive and one is
// free: a replacement takes the free one and the place it fell from becomes free, so the player always has to switch.
const ANCHORS_YAW = [-36, -12, 12, 36]
const MAX_ANCHOR_PITCH = 8

/**
 * Switch (Tracking): three targets alive at once, each drifting slowly (up to about 12 degrees per second). Holding fire
 * with the crosshair on a target for 0.4 s in total makes it fall, and a replacement appears at once somewhere else.
 * Score = targets eliminated (at most 75 in a Run).
 */
export const switchScenario: ScenarioDefinition = {
  id: 'switch',
  category: 'tracking',
  name: 'Switch',
  description: 'Three targets at once, each falls after a short stretch of tracking. Train switching between them.',
  rules(seed): Rules {
    const rng = createRng(seed)
    const events: TargetEvent[] = []
    let nextId = 0

    // Five draws per target, so the k-th target is the same whatever the player did before it.
    const spawn = (t: number, anchor: number, crosshair: { yaw: number; pitch: number }) => {
      const centre = { yaw: anchor, pitch: (rng() * 2 - 1) * MAX_ANCHOR_PITCH }
      const motion = createWander(rng, centre, {
        yaw: [{ amplitude: 4, minPeriodS: 2.5, maxPeriodS: 4 }],
        pitch: [{ amplitude: 3, minPeriodS: 2.5, maxPeriodS: 4 }],
      })
      const target = { id: nextId++, anchor, born: t, motion, onMs: 0 }
      const at = motion(0)
      events.push({ kind: 'spawn', t, id: target.id, yaw: at.yaw, pitch: at.pitch, radius: RADIUS_DEG, crosshair })
      return target
    }
    const pose = (a: ReturnType<typeof spawn>, t: number): Target => ({ id: a.id, radius: RADIUS_DEG, ...a.motion(t - a.born) })

    const alive = ANCHORS_YAW.slice(0, 3).map((anchor) => spawn(0, anchor, { yaw: 0, pitch: 0 }))
    let free = ANCHORS_YAW[3] ?? 0
    let targets: readonly Target[] = alive.map((a) => pose(a, 0))
    let eliminated = 0

    return {
      get targets() {
        return targets
      },
      events,
      get score() {
        return eliminated
      },
      step(t, aim, held) {
        const now = alive.map((a) => pose(a, t))
        const i = held ? now.findIndex((target) => angleBetween(aim, target) <= RADIUS_DEG) : -1
        const hit = alive[i]
        if (hit && ++hit.onMs >= FALL_MS) {
          eliminated++
          events.push({ kind: 'kill', t, id: hit.id })
          const replacement = spawn(t, free, aim)
          free = hit.anchor
          alive[i] = replacement
          now[i] = pose(replacement, t)
        }
        targets = now
      },
    }
  },
}
