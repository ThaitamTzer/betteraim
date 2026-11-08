import type { Rng } from '../rng'
import type { Aim, Target } from '../types'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** One sine component of a motion: swings `amplitude` degrees either side, once per period drawn from the range. */
export interface Wave {
  amplitude: number
  minPeriodS: number
  maxPeriodS: number
}

export interface WanderSpec {
  yaw: readonly Wave[]
  pitch: readonly Wave[]
}

type Pose = Pick<Target, 'yaw' | 'pitch' | 'speed' | 'heading'>

/**
 * A smooth, direction-changing path around `centre`: each axis is a sum of sines with random periods and phases,
 * so position and velocity are closed-form in t (ms since the target appeared) and no state has to be stepped.
 * Draws exactly 2 numbers per Wave, whatever the player does.
 * shortcut: yaw and pitch are used as flat degrees, fine while pitch stays within about +-15 (the specs keep it there).
 */
export function createWander(rng: Rng, centre: Aim, spec: WanderSpec): (tMs: number) => Pose {
  const draw = (w: Wave) => ({
    amplitude: w.amplitude,
    rate: (2 * Math.PI) / (w.minPeriodS + rng() * (w.maxPeriodS - w.minPeriodS)), // rad per s
    phase: rng() * 2 * Math.PI,
  })
  const yawWaves = spec.yaw.map(draw)
  const pitchWaves = spec.pitch.map(draw)
  const position = (waves: typeof yawWaves, s: number) =>
    waves.reduce((sum, w) => sum + w.amplitude * Math.sin(w.rate * s + w.phase), 0)
  const velocity = (waves: typeof yawWaves, s: number) =>
    waves.reduce((sum, w) => sum + w.amplitude * w.rate * Math.cos(w.rate * s + w.phase), 0)

  return (tMs) => {
    const s = tMs / 1000
    const yaw = centre.yaw + position(yawWaves, s)
    const pitch = centre.pitch + position(pitchWaves, s)
    const east = velocity(yawWaves, s) * Math.cos(pitch * RAD) // a degree of yaw is shorter away from the horizon
    const north = velocity(pitchWaves, s)
    return { yaw, pitch, speed: Math.hypot(east, north), heading: (Math.atan2(east, north) * DEG + 360) % 360 }
  }
}
