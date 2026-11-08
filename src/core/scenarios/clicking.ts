import { angleBetween, offsetAim } from '../aim'
import { createRng } from '../rng'
import type { Rules, ScenarioDefinition } from '../scenario'
import type { Aim, ScenarioId, Target, TargetEvent } from '../types'

export interface ClickingParams {
  id: ScenarioId
  name: string
  description: string
  /** Distance range of each new target from the crosshair, in degrees. */
  minDeg: number
  maxDeg: number
  /** Angular radius of the targets, in degrees. */
  radiusDeg: number
}

// Targets are kept within this pitch band so they stay at a reachable height: the vertical direction is
// mirrored when needed (never re-rolled, so the random draws do not depend on where the crosshair is).
const MAX_SPAWN_PITCH = 40

/** One target at a time, spawned a random distance away from the crosshair; Score = hits x accuracy. */
export const createClickingScenario = (p: ClickingParams): ScenarioDefinition => ({
  id: p.id,
  category: 'clicking',
  name: p.name,
  description: p.description,
  rules(seed): Rules {
    const rng = createRng(seed)
    const events: TargetEvent[] = []
    let targets: readonly Target[] = []
    let nextId = 0

    const spawn = (t: number, crosshair: Aim) => {
      const distance = p.minDeg + rng() * (p.maxDeg - p.minDeg)
      const bearing = rng() * 360
      let at = offsetAim(crosshair, distance, bearing)
      if (Math.abs(at.pitch) > MAX_SPAWN_PITCH) {
        const mirrored = offsetAim(crosshair, distance, 180 - bearing)
        if (Math.abs(mirrored.pitch) < Math.abs(at.pitch)) at = mirrored
      }
      const target: Target = { id: nextId++, ...at, radius: p.radiusDeg }
      targets = [target]
      events.push({ kind: 'spawn', t, id: target.id, ...at, radius: p.radiusDeg, crosshair })
    }

    spawn(0, { yaw: 0, pitch: 0 })

    let hits = 0
    let shots = 0

    return {
      get targets() {
        return targets
      },
      events,
      get score() {
        return shots === 0 ? 0 : (hits * hits) / shots // hits x accuracy
      },
      shoot(t, aim) {
        shots++
        const hit = targets.find((target) => angleBetween(aim, target) <= target.radius)
        events.push({ kind: 'shot', t, id: hit?.id ?? null })
        if (!hit) return
        hits++
        events.push({ kind: 'kill', t, id: hit.id })
        targets = []
        spawn(t, aim)
      },
    }
  },
})
