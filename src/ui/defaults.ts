import type { Fov } from '../core'

// Placeholders until Game Profiles exist (ticket #3).
export const DEFAULT_FOV: Fov = { degrees: 103, axis: 'horizontal' }
export const CUSTOM_PROFILE_ID = 'custom'

export const newSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
