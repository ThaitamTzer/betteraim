export const newSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
