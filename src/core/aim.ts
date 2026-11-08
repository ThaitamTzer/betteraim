import type { Aim, Cm360, Fov } from './types'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** Degrees the view turns per mouse count: 360 / (cm/360 x DPI / 2.54). Horizontal and vertical are equal (1:1). */
export const degreesPerCount = (cm360: Cm360, dpi: number): number => 360 / ((cm360 * dpi) / 2.54)

/** Wraps an angle into [-180, 180]. */
export const wrapDeg = (degrees: number): number => degrees - 360 * Math.round(degrees / 360)

/** Shortest signed turn that takes the crosshair from `from` onto `to`: the yaw and pitch to add. */
export const aimDelta = (from: Aim, to: Aim): Aim => ({
  yaw: wrapDeg(to.yaw - from.yaw),
  pitch: to.pitch - from.pitch,
})

export type Vec = readonly [number, number, number]

// Unit vector for a view direction. Right-handed, +y up, forward is -z (so yaw > 0 points to +x).
export const directionOf = ({ yaw, pitch }: Aim): Vec => [
  Math.cos(pitch * RAD) * Math.sin(yaw * RAD),
  Math.sin(pitch * RAD),
  -Math.cos(pitch * RAD) * Math.cos(yaw * RAD),
]

/** The view direction of a unit vector, the inverse of `directionOf`. */
export const aimOf = ([x, y, z]: Vec): Aim => ({ yaw: Math.atan2(x, -z) * DEG, pitch: Math.asin(Math.max(-1, Math.min(1, y))) * DEG })

export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** True angular distance between two directions, in degrees (never the flat yaw/pitch distance). */
export const angleBetween = (a: Aim, b: Aim): number => {
  const [ax, ay, az] = directionOf(a)
  const [bx, by, bz] = directionOf(b)
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
  return Math.atan2(cross, ax * bx + ay * by + az * bz) * DEG
}

/** The direction `distance` degrees away from `from`, along `bearing` (0 = up, 90 = right), on the sphere. */
export const offsetAim = (from: Aim, distance: number, bearing: number): Aim => {
  const pitch = from.pitch * RAD
  const d = distance * RAD
  const b = bearing * RAD
  const sinPitch = Math.sin(pitch) * Math.cos(d) + Math.cos(pitch) * Math.sin(d) * Math.cos(b)
  const newPitch = Math.asin(Math.max(-1, Math.min(1, sinPitch)))
  const dYaw = Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(pitch), Math.cos(d) - Math.sin(pitch) * sinPitch)
  return { yaw: wrapDeg(from.yaw + dYaw * DEG), pitch: newPitch * DEG }
}

/** Vertical FOV in degrees for a given width / height, for the render layer. */
export const verticalFovDeg = (fov: Fov, aspect: number): number =>
  fov.axis === 'vertical'
    ? fov.degrees
    : 2 * Math.atan(Math.tan((fov.degrees * RAD) / 2) / aspect) * DEG
