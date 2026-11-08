/** Four significant digits, no trailing zeros: 40.82, 1.273, 1018. */
export const fmt = (n: number): string => String(Number(n.toPrecision(4)))

/** The player's local calendar day of a start time, as YYYY-MM-DD (sorts chronologically): what History buckets Runs by. */
export const localDay = (startedAt: number): string => {
  const d = new Date(startedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What to show a player for a caught error. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
