import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { coachChoiceCache, parseChoiceEntries, resetChoiceCache } from './choice-cache'

describe('the saved AI Coach answers', () => {
  const store = new Map<string, string>()
  let broken = false
  beforeEach(() => {
    store.clear()
    broken = false
    resetChoiceCache()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (broken) throw new Error('quota')
          store.set(k, v)
        },
      },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'))

  it('survive a reload', () => {
    coachChoiceCache().set('k', { recommended: 38.5, reasons: ['Balanced.'] })
    resetChoiceCache() // a new page load reads storage again
    expect(coachChoiceCache().get('k')).toEqual({ recommended: 38.5, reasons: ['Balanced.'] })
  })

  it('keep only the last few', () => {
    for (let i = 0; i < 12; i++) coachChoiceCache().set(`k${i}`, { recommended: 30 + i, reasons: [] })
    resetChoiceCache()
    expect(coachChoiceCache().get('k11')).toBeDefined()
    expect(coachChoiceCache().get('k0')).toBeUndefined()
    expect(JSON.parse([...store.values()][0]!)).toHaveLength(5)
  })

  it('start empty from a corrupt save, and drop the entries that are not well formed', () => {
    store.set('betteraim.coachChoices', '{not json')
    expect(coachChoiceCache().get('k')).toBeUndefined()
    expect(parseChoiceEntries([['ok', { recommended: 40, reasons: ['x'] }], ['bad', { recommended: 'forty', reasons: [] }], ['bad2', { recommended: 40, reasons: [1] }], 'junk', null])).toEqual([
      ['ok', { recommended: 40, reasons: ['x'] }],
    ])
    expect(parseChoiceEntries('x')).toEqual([])
  })

  it('still hold for the life of the tab when storage refuses to save', () => {
    broken = true
    coachChoiceCache().set('k', { recommended: 40, reasons: ['x'] })
    expect(coachChoiceCache().get('k')).toBeDefined()
  })
})
