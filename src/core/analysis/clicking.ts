import { angleBetween, cross, directionOf, dot } from '../aim'
import type { Vec } from '../aim'
import { createRun } from '../run'
import { tallyShots } from '../tally'
import type { Aim } from '../types'
import { readProfile, speedProfile } from './velocity'
import type { AimMovement, ClickingAnalysis, Outcome, RunData } from './types'

const DEG = 180 / Math.PI

/** Where the crosshair was after each mouse move, rebuilt by replaying the input (nothing else is recorded). */
function crosshairPath(run: RunData): { t: number; aim: Aim }[] {
  const replayed = createRun(run)
  const path = [{ t: 0, aim: { yaw: 0, pitch: 0 } }]
  for (const event of run.input) {
    replayed.push(event)
    if (event.kind === 'move') path.push({ t: event.t, aim: replayed.state().crosshair })
  }
  return path
}

/** Index of the first sample later than `t` (the path is in time order): a Run has many Aim Movements and tens of thousands of samples. */
function firstAfter(path: readonly { t: number }[], t: number): number {
  let lo = 0
  let hi = path.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (path[mid]!.t > t) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * The Ideal Path is the great circle from `from` to `to`. Returns where a view direction is on it: `along` is the
 * angle from `from` in the direction of `to`, `across` the signed perpendicular angle from the circle. Null when the
 * two directions coincide and there is no path.
 */
function idealPath(from: Aim, to: Aim) {
  const start = directionOf(from)
  const normal = cross(start, directionOf(to))
  const size = Math.hypot(...normal)
  if (size < 1e-9) return null
  const n: Vec = [normal[0] / size, normal[1] / size, normal[2] / size]
  const toward = cross(n, start)
  return (aim: Aim) => {
    const v = directionOf(aim)
    return { along: Math.atan2(dot(v, toward), dot(v, start)) * DEG, across: Math.asin(Math.max(-1, Math.min(1, dot(v, n)))) * DEG }
  }
}

export function analyseClicking(run: RunData): ClickingAnalysis {
  const path = crosshairPath(run)
  const kills = new Map<number, number>()
  for (const e of run.targetEvents) if (e.kind === 'kill') kills.set(e.id, e.t)

  const movements: AimMovement[] = []
  for (const e of run.targetEvents) {
    const endMs = e.kind === 'spawn' ? kills.get(e.id) : undefined
    if (e.kind !== 'spawn' || endMs === undefined) continue
    const locate = idealPath(e.crosshair, e)
    if (!locate) continue

    // Samples of the Aim Movement: the crosshair at target appearance, then after every move up to the hit.
    // A move at the very ms of the hit counts as part of this movement.
    const inMovement: { t: number; aim: Aim }[] = [{ t: e.t, aim: e.crosshair }]
    for (let i = firstAfter(path, e.t); i < path.length && path[i]!.t <= endMs; i++) inMovement.push(path[i]!)
    const samples = inMovement.map((s) => ({ ms: s.t - e.t, ...locate(s.aim) }))
    const bins = Math.ceil(endMs - e.t) + 1
    const along = new Array<number>(bins).fill(0)
    const across = new Array<number>(bins).fill(0)
    samples.forEach((s, i) => {
      const before = samples[i - 1]
      if (!before) return
      const bin = Math.min(bins - 1, Math.floor(s.ms))
      along[bin] = (along[bin] ?? 0) + s.along - before.along
      across[bin] = (across[bin] ?? 0) + s.across - before.across
    })

    const speed = speedProfile(along, across)
    const { peaks, primaryEnd } = readProfile(speed)
    // Path Deviation: perpendicular distance, averaged over the path travelled (each ms counts as much as it moved).
    let sampleIndex = 0
    let deviationSum = 0
    speed.forEach((v, ms) => {
      while (samples[sampleIndex + 1] && Math.floor(samples[sampleIndex + 1]?.ms ?? 0) <= ms) sampleIndex++
      deviationSum += v * Math.abs(samples[sampleIndex]?.across ?? 0)
    })
    const travelled = speed.reduce((a, b) => a + b, 0)
    const pathDeviation = travelled === 0 ? 0 : deviationSum / travelled
    // Length of the smoothed path (speed is deg/s per ms), so one-count jitter does not add distance.
    const pathLength = travelled / 1000
    // Where the crosshair is once the Primary Submovement's last ms has passed. With no velocity peak there is no
    // ballistic push to judge (a creep, or no movement at all), so the hit position stands in for it: on-target.
    const last = primaryEnd === null ? samples.length - 1 : samples.findLastIndex((s) => Math.floor(s.ms) <= primaryEnd)
    const primaryEndAlong = samples[Math.max(0, last)]?.along ?? 0
    const idealDistance = angleBetween(e.crosshair, e)
    let outcome: Outcome = 'on-target'
    if (primaryEndAlong > idealDistance + e.radius) outcome = 'overshoot'
    else if (primaryEndAlong < idealDistance - e.radius) outcome = 'undershoot'

    movements.push({ targetId: e.id, startMs: e.t, endMs, idealDistance, pathLength, primaryEndAlong, outcome, pathDeviation, velocityPeaks: peaks })
  }

  const { hits, shots, accuracy } = tallyShots(run.targetEvents)
  const count = (outcome: Outcome) => movements.filter((m) => m.outcome === outcome).length
  const perMovement = (n: number) => (movements.length === 0 ? 0 : n / movements.length)
  const total = (pick: (m: AimMovement) => number) => movements.reduce((sum, m) => sum + pick(m), 0)
  const overshoots = count('overshoot')
  const undershoots = count('undershoot')
  const seconds = total((m) => m.endMs - m.startMs) / 1000
  return {
    category: 'clicking',
    movements,
    movementCount: movements.length,
    shots,
    hits,
    accuracy,
    mouseSpeed: seconds === 0 ? 0 : total((m) => m.pathLength) / seconds,
    overshoots,
    undershoots,
    overshootRate: perMovement(overshoots),
    undershootRate: perMovement(undershoots),
    pathDeviation: perMovement(total((m) => m.pathDeviation)),
    smoothness: perMovement(total((m) => m.velocityPeaks)),
  }
}
