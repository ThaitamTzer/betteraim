import { parsePlayerContext } from '../core'
import type { PlayerContext } from '../core'

/**
 * Player Context (role, mousepad size, wrist or arm aiming; every field optional), kept in localStorage under its own key. What is read back
 * goes through the core's `parsePlayerContext`, so a hand-edited or damaged save can only ever give one of the fixed choices. It reaches the
 * AI Coach only as those choices, never as typed text.
 */
const KEY = 'betteraim.playerContext'

// Used when storage is blocked (private window, quota), so the choices still hold until the tab closes.
let session: PlayerContext | null = null

export const loadPlayerContext = (): PlayerContext => {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return parsePlayerContext(JSON.parse(stored))
  } catch {
    // unreadable storage or corrupt JSON: fall through
  }
  return session ?? {}
}

export const savePlayerContext = (context: PlayerContext): void => {
  session = parsePlayerContext(context)
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // kept in `session` only
  }
}
