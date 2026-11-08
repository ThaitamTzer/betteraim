/** What to show a player for a caught value: an Error's message, else the value as text. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
