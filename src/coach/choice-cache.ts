import { createChoiceCache } from '../core'
import type { ChoiceCache, CoachChoice } from '../core'

/**
 * The AI Coach's answers per data snapshot (`snapshotKey`), kept across reloads so the same data shows the same Recommended Sensitivity.
 * A few entries only, in their own localStorage key: it holds reasons in text, never keys, Runs or raw data. If storage is blocked the
 * answers are kept for the life of the tab.
 */
const KEY = 'betteraim.coachChoices'

const isChoice = (v: unknown): v is CoachChoice => {
  const c = v as Partial<CoachChoice> | null
  return typeof c === 'object' && c !== null && typeof c.recommended === 'number' && Number.isFinite(c.recommended) && Array.isArray(c.reasons) && c.reasons.every((r) => typeof r === 'string')
}

/** The saved entries, those that are still well formed; never throws. */
export function parseChoiceEntries(raw: unknown): [string, CoachChoice][] {
  if (!Array.isArray(raw)) return []
  return raw.filter((e): e is [string, CoachChoice] => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && isChoice(e[1]))
}

let cache: ChoiceCache | undefined

/** The one cache of the app, loaded from storage on first use. */
export function coachChoiceCache(): ChoiceCache {
  if (cache) return cache
  let saved: [string, CoachChoice][] = []
  try {
    saved = parseChoiceEntries(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
  } catch {
    // unreadable storage or corrupt JSON: start empty
  }
  return (cache = createChoiceCache(saved, (entries) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries))
    } catch {
      // kept in memory only
    }
  }))
}

/** For tests: forget the loaded cache so the next call reads storage again. */
export const resetChoiceCache = (): void => {
  cache = undefined
}
