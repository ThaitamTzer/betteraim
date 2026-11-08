import { angleFrom, directionOf, wrapDeg } from '../aim'
import type { Vec } from '../aim'
import { replaySteps, RUN_DURATION_MS } from '../run'
import type { Aim, Target } from '../types'
import { speedProfile } from './velocity'
import type { Lead, RunData, TrackingAnalysis } from './types'

const RAD = Math.PI / 180

// What counts as tracking, and why. These are judgement calls, kept apart from the Score rule (Time on Target, which
// is exactly "fire held and crosshair within the radius" and lives in the Scenarios).
// A step is sampled for Ahead/Behind (and mouse speed) when all of these hold, against the nearest target:
// - Fire is held, as for the Score: tracking without firing earns nothing, so it is not measured either.
// - The crosshair is within TRACKING_WINDOW_RADII radii of it. The window has to be wider than the target: a player
//   100 ms behind a target moving at 40 deg/s is 4 degrees (2 radii) off, and sampling only on-target steps would drop
//   exactly the laggards and bias the mean toward zero. 3 radii = 6 degrees covers 150 ms at the fastest target speed
//   and stays far under half the 24 degrees between Switch's targets, so the crosshair between two of them, or idle
//   anywhere else, is never sampled.
// - The crosshair was inside that window for SETTLE_MS before the step and stays inside it for SETTLE_MS after. A flick
//   (Switch, or finding the target again after losing it) passes through the window at speed, accelerating away from
//   one target or correcting onto the next: that is aiming, not tracking, and would put a large random offset, and the
//   flick's speed, into the means. 50 ms is longer than the 36 ms reach of the speed smoothing, so a flick's speed does
//   not leak into a sample from either side.
// - The target is moving faster than MIN_SPEED: where it turns round its heading is arbitrary and "ahead" has no
//   meaning. At 2 deg/s even a 100 ms error is 0.2 degrees, inside the dead zone, so nothing is lost.
// DEAD_ZONE_DEG 0.25 (an eighth of the 2 degree radius): the mean of a perfect tracker is not exactly 0. Our bot
// reads -0.02 degrees on Strafe and -0.01 on Switch, from lagging one step behind the target; the integer mouse
// counts average out. A lead or lag a player can feel is a frame (16 ms) or more, which is 0.3 degrees at Strafe's
// average target speed (18 deg/s) and 0.1 at Switch's (7): the dead zone sits 10 times above the noise, and an offset
// that small cannot take the crosshair off a target by itself. Strafe flags a 14 ms lead or lag, Switch 37 ms.
const TRACKING_WINDOW_RADII = 3
const SETTLE_MS = 50
const MIN_SPEED = 2
const DEAD_ZONE_DEG = 0.25

/** Ahead, Behind, or level with the target: a mean offset in degrees (positive Ahead) read through the dead zone. */
export const leadOf = (meanOffset: number): Lead =>
  meanOffset > DEAD_ZONE_DEG ? 'ahead' : meanOffset < -DEAD_ZONE_DEG ? 'behind' : 'level'

/** Signed degrees from `target` to the crosshair along the target's direction of travel (positive is Ahead). */
function alongHeading(crosshair: Aim, target: Aim, headingDeg: number): number {
  const east = wrapDeg(crosshair.yaw - target.yaw) * Math.cos(target.pitch * RAD)
  const north = crosshair.pitch - target.pitch
  const heading = headingDeg * RAD
  return east * Math.sin(heading) + north * Math.cos(heading)
}

/** For every step, how many steps in a row (itself included) `flags` is true from it forward, or backward. */
function streaks(flags: readonly boolean[], direction: 1 | -1): number[] {
  const out = new Array<number>(flags.length).fill(0)
  for (let i = direction === 1 ? 0 : flags.length - 1; i >= 0 && i < flags.length; i += direction) {
    out[i] = flags[i] ? (out[i - direction] ?? 0) + 1 : 0
  }
  return out
}

export function analyseTracking(run: RunData): TrackingAnalysis {
  const kills = new Set(run.targetEvents.filter((e) => e.kind === 'kill').map((e) => e.t))
  // Per step: how far the crosshair moved east and north (signed, smoothed together below), whether it is inside the
  // tracking window, and its offset along the target's travel if everything else needed to sample it holds.
  const east: number[] = []
  const north: number[] = []
  const near: boolean[] = []
  const offsets: (number | null)[] = []
  let timeOnTargetMs = 0
  let before: Aim = { yaw: 0, pitch: 0 }
  // The crosshair object changes only when the mouse moved, so its direction is worked out once per move, not per target per step.
  let looking: Aim | undefined
  let direction: Vec = [0, 0, 0]

  replaySteps(run, run.input, ({ t, crosshair, held, targets }) => {
    if (crosshair === before) {
      east.push(0) // no move this step: exactly what the two lines below give for the same crosshair
      north.push(0)
    } else {
      east.push(wrapDeg(crosshair.yaw - before.yaw) * Math.cos(crosshair.pitch * RAD))
      north.push(crosshair.pitch - before.pitch)
    }
    before = crosshair

    // A fall means the fire was held on the target at this step, but the state already shows its replacement.
    let on = kills.has(t)
    let nearest: { target: Target; distance: number } | undefined
    if (crosshair !== looking) {
      looking = crosshair
      direction = directionOf(crosshair)
    }
    for (const target of targets) {
      const distance = angleFrom(direction, target)
      if (held && distance <= target.radius) on = true
      if (!nearest || distance < nearest.distance) nearest = { target, distance }
    }
    if (on) timeOnTargetMs++

    const inWindow = nearest !== undefined && nearest.distance <= TRACKING_WINDOW_RADII * nearest.target.radius
    near.push(inWindow)
    const heading = nearest?.target.heading
    const moving = (nearest?.target.speed ?? 0) >= MIN_SPEED
    offsets.push(inWindow && held && moving && heading !== undefined && nearest ? alongHeading(crosshair, nearest.target, heading) : null)
  })

  const settled = streaks(near, 1)
  const staying = streaks(near, -1)
  const speeds = speedProfile(east, north)
  let samples = 0
  let offsetSum = 0
  let speedSum = 0
  offsets.forEach((offset, i) => {
    if (offset === null || (settled[i] ?? 0) < SETTLE_MS || (staying[i] ?? 0) < SETTLE_MS) return
    samples++
    offsetSum += offset
    speedSum += speeds[i] ?? 0
  })
  const meanOffset = samples === 0 ? 0 : offsetSum / samples
  return {
    category: 'tracking',
    meanOffset,
    lead: leadOf(meanOffset),
    samples,
    timeOnTargetMs,
    timeOnTargetShare: timeOnTargetMs / RUN_DURATION_MS,
    mouseSpeed: samples === 0 ? 0 : speedSum / samples,
  }
}
