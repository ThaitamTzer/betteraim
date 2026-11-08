/** Four significant digits, no trailing zeros: 40.82, 1.273, 1018. */
export const fmt = (n: number): string => String(Number(n.toPrecision(4)))
