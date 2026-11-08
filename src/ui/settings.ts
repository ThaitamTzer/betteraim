import { cm360For, isGameProfileId } from '../core'
import type { GameProfileId } from '../core'

/**
 * What the player told BetterAim about their setup, kept in localStorage. To add a setting: add a field here, read it in
 * `parse` (falling back to a default when an older save lacks it) and write it through `saveSettings`.
 */
export interface Settings {
  gameProfileId: GameProfileId
  /** As typed in that game's settings (its Game Sensitivity), at `dpi`. */
  gameSensitivity: number
  dpi: number
}

const KEY = 'betteraim.settings'

/** True when the setup is something a mouse can plausibly do: DPI 100-32000 and 0.1-1000 cm/360. */
export const validSetup = (id: GameProfileId, gameSensitivity: number, dpi: number): boolean => {
  if (!(gameSensitivity > 0) || !(dpi >= 100 && dpi <= 32000)) return false
  const cm360 = cm360For(id, gameSensitivity, dpi)
  return cm360 >= 0.1 && cm360 <= 1000
}

const parse = (raw: unknown): Settings | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const { gameProfileId, gameSensitivity, dpi } = raw as Record<string, unknown>
  if (typeof gameProfileId !== 'string' || !isGameProfileId(gameProfileId)) return null
  if (typeof gameSensitivity !== 'number' || typeof dpi !== 'number') return null
  return validSetup(gameProfileId, gameSensitivity, dpi) ? { gameProfileId, gameSensitivity, dpi } : null
}

// Used when storage is blocked (private window, quota), so the setup still holds until the tab closes.
let session: Settings | null = null

/** The saved settings, or null on a first visit (and whenever the save is missing or unusable). */
export const loadSettings = (): Settings | null => {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return parse(JSON.parse(stored))
  } catch {
    // unreadable storage or corrupt JSON: treat as a first visit
  }
  return session
}

export const saveSettings = (settings: Settings): void => {
  session = settings
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // kept in `session` only
  }
}
