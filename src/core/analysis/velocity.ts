// Velocity profile of one Aim Movement: smoothing, peaks, and where the Primary Submovement ends.
//
// Thresholds, and why. They were swept over SIGMA 8-12 ms and PROMINENCE 0.10-0.20 against bots (perfect, 30% over,
// 30% short) at 14, 45, 152 and 286 millidegrees per count with 1, 8 and 16 ms between events: every Aim Movement
// classified correctly across that whole grid, so these values sit in the middle of a wide plateau, not on an edge.
// - The steps are summed per ms as SIGNED components along and across the Ideal Path and only then smoothed, and the
//   speed is the length of that smoothed vector. Smoothing per-ms |step| instead turns the one-count back-and-forth
//   of a coarse mouse (or a resting hand) into a fake speed of 100+ deg/s and hides the dip between two pushes.
// - SIGMA_MS 12: wide enough that the spacing of mouse events (1 to 16 ms, 1000 to 60 Hz) leaves no ripple and integer
//   counts make no peaks; much narrower than a submovement (80 to 250 ms) so the dip between two pushes survives.
// - PEAK_PROMINENCE 0.15: a peak counts only when it rises 15% of the Aim Movement's top speed above the dip next to
//   it. Tremor and a stray count stay below that; a correction (about a third of the top speed) is far above.
//   Peaks are measured against rest at both ends of the Aim Movement.
// - MIN_PEAK_SPEED 5 deg/s: an absolute floor so a nearly still hand does not produce peaks out of noise.
// - END_FRACTION 0.1: with no later peak, the Primary Submovement ends when the speed falls under 10% of its peak.
//   For a bell-shaped push that is within about 1% of the distance of where it truly stops, far less than the 1 degree
//   a Flick leaves between a 30% error and the target edge. With a later peak it ends at the dip between them.
const SIGMA_MS = 12
const KERNEL_RADIUS = 3 * SIGMA_MS
const PEAK_PROMINENCE = 0.15
const MIN_PEAK_SPEED = 5
const END_FRACTION = 0.1

const kernel = (() => {
  const weights = Array.from({ length: 2 * KERNEL_RADIUS + 1 }, (_, i) => Math.exp(-0.5 * ((i - KERNEL_RADIUS) / SIGMA_MS) ** 2))
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => w / sum)
})()

const smooth = (steps: readonly number[]): number[] => {
  const out = new Array<number>(steps.length)
  for (let i = 0; i < steps.length; i++) {
    let sum = 0
    const to = Math.min(steps.length - 1, i + KERNEL_RADIUS)
    for (let k = Math.max(0, i - KERNEL_RADIUS); k <= to; k++) sum += steps[k]! * kernel[k - i + KERNEL_RADIUS]!
    out[i] = sum * 1000
  }
  return out
}

/**
 * Smoothed speed in deg/s, one value per ms. `along[i]` and `across[i]` are the signed degrees the crosshair moved
 * along and across the Ideal Path during ms i.
 */
export function speedProfile(along: readonly number[], across: readonly number[]): number[] {
  const lateral = smooth(across)
  return smooth(along).map((a, i) => Math.hypot(a, lateral[i] ?? 0))
}

// How far a peak stands above the higher of the two dips on either side, reaching rest (0) at the ends.
function prominence(v: readonly number[], i: number): number {
  const at = v[i] ?? 0
  let left = at
  let j = i - 1
  for (; j >= 0 && (v[j] ?? 0) <= at; j--) left = Math.min(left, v[j] ?? 0)
  if (j < 0) left = 0
  let right = at
  j = i + 1
  for (; j < v.length && (v[j] ?? 0) <= at; j++) right = Math.min(right, v[j] ?? 0)
  if (j >= v.length) right = 0
  return at - Math.max(left, right)
}

/**
 * The peaks of a speed profile that count, and the last ms of the Primary Submovement (null when there is no peak,
 * which means the crosshair hardly moved).
 */
export function readProfile(v: readonly number[]): { peaks: number; primaryEnd: number | null } {
  const top = v.reduce((a, b) => Math.max(a, b), 0)
  const peaks: number[] = []
  for (let i = 0; i < v.length; i++) {
    const at = v[i] ?? 0
    if (at < MIN_PEAK_SPEED || at <= (v[i - 1] ?? 0) || at < (v[i + 1] ?? 0)) continue
    if (prominence(v, i) >= PEAK_PROMINENCE * top) peaks.push(i)
  }
  const [first, second] = peaks
  if (first === undefined) return { peaks: 0, primaryEnd: null }
  const slow = v.findIndex((s, i) => i > first && s <= END_FRACTION * (v[first] ?? 0))
  let end = slow === -1 ? v.length - 1 : slow
  if (second !== undefined) {
    let dip = first
    for (let i = first; i <= second; i++) if ((v[i] ?? 0) < (v[dip] ?? 0)) dip = i
    end = Math.min(end, dip)
  }
  return { peaks: peaks.length, primaryEnd: end }
}
