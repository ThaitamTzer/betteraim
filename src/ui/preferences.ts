/**
 * The Options the player chose (crosshair, colours, fire button, hit sound, Practice FOV), kept in localStorage. Separate from
 * `Settings` (the game setup) because Options have defaults and so exist before onboarding. To add an option: add a field to
 * `Preferences` and `defaultPreferences`, read it in `parsePreferences` (a missing or bad value falls back to its default, so
 * older saves keep working), then add a section to the Options screen that calls `update`.
 */
export interface Preferences {
  crosshair: {
    style: 'cross' | 'dot'
    /** px: the length of each arm of the cross, or the diameter of the dot. */
    size: number
    /** px, cross only. */
    thickness: number
    /** px between the centre and each arm, cross only. */
    gap: number
    opacity: number
    color: string
  }
  /** `#rrggbb` */
  targetColor: string
  /** Physical mouse button (MouseEvent.button) that fires. The core always sees button 0; the shell swaps them. */
  fireButton: number
  hitSound: { on: boolean; volume: number }
  /** Horizontal degrees on a 16:9 screen, or null to use the Game Profile FOV. Practice only, see `practiceFov` in the core. */
  practiceFov: number | null
}

/** Valid [min, max] of the numeric options; the Options sliders use the same numbers. */
export const RANGES = {
  size: [2, 30],
  thickness: [1, 6],
  gap: [0, 15],
  opacity: [0.2, 1],
  volume: [0, 1],
  fov: [40, 150],
  fireButton: [0, 4],
} as const satisfies Record<string, readonly [number, number]>

export const defaultPreferences: Preferences = {
  crosshair: { style: 'cross', size: 7, thickness: 2, gap: 3, opacity: 1, color: '#5eead4' },
  targetColor: '#ffb35c',
  fireButton: 0,
  hitSound: { on: true, volume: 0.5 },
  practiceFov: null,
}

const KEY = 'betteraim.preferences'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const inRange = (v: unknown, [min, max]: readonly [number, number]): v is number => typeof v === 'number' && v >= min && v <= max
const hex = (v: unknown, fallback: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback)

/** Reads a saved value field by field: whatever is missing or out of range gets its default. Never throws. */
export const parsePreferences = (raw: unknown): Preferences => {
  const d = defaultPreferences
  const { crosshair: c, targetColor, fireButton, hitSound: h, practiceFov } = obj(raw)
  const ch = obj(c)
  const sound = obj(h)
  return {
    crosshair: {
      style: ch.style === 'cross' || ch.style === 'dot' ? ch.style : d.crosshair.style,
      size: inRange(ch.size, RANGES.size) ? ch.size : d.crosshair.size,
      thickness: inRange(ch.thickness, RANGES.thickness) ? ch.thickness : d.crosshair.thickness,
      gap: inRange(ch.gap, RANGES.gap) ? ch.gap : d.crosshair.gap,
      opacity: inRange(ch.opacity, RANGES.opacity) ? ch.opacity : d.crosshair.opacity,
      color: hex(ch.color, d.crosshair.color),
    },
    targetColor: hex(targetColor, d.targetColor),
    fireButton: inRange(fireButton, RANGES.fireButton) && Number.isInteger(fireButton) ? fireButton : d.fireButton,
    hitSound: {
      on: typeof sound.on === 'boolean' ? sound.on : d.hitSound.on,
      volume: inRange(sound.volume, RANGES.volume) ? sound.volume : d.hitSound.volume,
    },
    practiceFov: inRange(practiceFov, RANGES.fov) ? practiceFov : null,
  }
}

// Used when storage is blocked (private window, quota), so the choices still hold until the tab closes.
let session: Preferences | null = null

export const loadPreferences = (): Preferences => {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return parsePreferences(JSON.parse(stored))
  } catch {
    // unreadable storage or corrupt JSON: fall through
  }
  return session ?? defaultPreferences
}

export const savePreferences = (preferences: Preferences): void => {
  session = preferences
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // kept in `session` only
  }
}
