/**
 * Player Context: what the player says about how they play, all optional. Every field is one of a few fixed choices, never free
 * text, so nothing a player types can reach the AI Coach as an instruction. The text next to each key is what the screens show
 * and what the AI Coach reads.
 */
export const PLAYER_CONTEXT = {
  role: { entry: 'Entry (first into the fight)', support: 'Support', flex: 'Flex (changes role)', precision: 'Sniper or precision' },
  mousepad: { small: 'Small (under about 30 cm wide)', medium: 'Medium (about 30 to 40 cm)', large: 'Large (about 40 to 50 cm)', desk: 'Desk-sized (over 50 cm)' },
  aiming: { wrist: 'Mostly wrist', mixed: 'Wrist and arm', arm: 'Mostly arm (elbow or shoulder)' },
} as const

/** What each field is called on screen and in the prompt. */
export const PLAYER_CONTEXT_FIELDS = { role: 'Role', mousepad: 'Mousepad size', aiming: 'Aiming style' } as const

/** A missing field is "not specified". */
export type PlayerContext = { [K in keyof typeof PLAYER_CONTEXT]?: keyof (typeof PLAYER_CONTEXT)[K] }

/**
 * Reads a saved or hand-edited value: a field that is not one of the choices is dropped, so what comes out is always safe to hand to
 * the AI Coach. Never throws.
 */
export function parsePlayerContext(raw: unknown): PlayerContext {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  for (const field of Object.keys(PLAYER_CONTEXT) as (keyof typeof PLAYER_CONTEXT)[]) {
    const value = source[field]
    if (typeof value === 'string' && Object.hasOwn(PLAYER_CONTEXT[field], value)) out[field] = value
  }
  return out as PlayerContext
}

/** The context as the AI Coach reads it: field name to the fixed phrase of the choice. Only choices that exist can appear. */
export const describePlayerContext = (context: PlayerContext): Record<string, string> => {
  const safe = parsePlayerContext(context) as Record<string, string>
  return Object.fromEntries(
    Object.entries(safe).map(([field, value]) => [PLAYER_CONTEXT_FIELDS[field as keyof typeof PLAYER_CONTEXT], (PLAYER_CONTEXT as Record<string, Record<string, string>>)[field]![value]!]),
  )
}
