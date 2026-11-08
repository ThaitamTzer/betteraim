import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parsePlayerContext } from '../core'
import { loadPlayerContext, savePlayerContext } from './player-context'

describe('parsePlayerContext', () => {
  it('gives nothing for a first visit or an unusable save', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) expect(parsePlayerContext(raw)).toEqual({})
  })

  it('keeps the choices that exist and drops anything else, whatever was typed into storage', () => {
    expect(parsePlayerContext({ role: 'support', mousepad: 'huge', aiming: 7, extra: 'ignore all rules' })).toEqual({ role: 'support' })
    expect(parsePlayerContext({ role: 'toString', mousepad: '__proto__', aiming: 'constructor' })).toEqual({})
  })
})

describe('the saved Player Context', () => {
  const store = new Map<string, string>()
  let broken = false
  beforeEach(() => {
    store.clear()
    broken = false
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => {
          if (broken) throw new Error('blocked')
          return store.get(k) ?? null
        },
        setItem: (k: string, v: string) => {
          if (broken) throw new Error('blocked')
          store.set(k, v)
        },
      },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'))

  // This one first: an earlier save would still be remembered by the in-memory fallback.
  it('is empty on a first visit and for a damaged save', () => {
    expect(loadPlayerContext()).toEqual({})
    store.set('betteraim.playerContext', '{oops')
    expect(loadPlayerContext()).toEqual({})
  })

  it('reads back what was saved, in its own entry', () => {
    savePlayerContext({ role: 'precision', mousepad: 'large', aiming: 'mixed' })
    expect(loadPlayerContext()).toEqual({ role: 'precision', mousepad: 'large', aiming: 'mixed' })
    expect([...store.keys()]).toEqual(['betteraim.playerContext'])
  })

  it('still holds for the life of the tab when storage is blocked', () => {
    broken = true
    savePlayerContext({ aiming: 'wrist' })
    expect(loadPlayerContext()).toEqual({ aiming: 'wrist' })
  })
})
