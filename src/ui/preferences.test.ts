import { describe, expect, it } from 'vitest'
import { defaultPreferences, parsePreferences } from './preferences'

describe('parsePreferences', () => {
  it('gives the defaults for a first visit or an unusable save', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) expect(parsePreferences(raw)).toEqual(defaultPreferences)
  })

  it('reads back what was saved, through JSON like localStorage does', () => {
    const saved = {
      crosshair: { style: 'dot', size: 9, thickness: 3, gap: 0, opacity: 0.5, color: '#ff0000' },
      targetColor: '#00ff00',
      fireButton: 2,
      hitSound: { on: false, volume: 0.25 },
      practiceFov: 110,
    } as const
    expect(parsePreferences(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  it('keeps a saved null Practice FOV (no override)', () => {
    expect(parsePreferences({ practiceFov: null }).practiceFov).toBeNull()
  })

  it('replaces only the fields that are bad, so an older or edited save keeps the rest', () => {
    const parsed = parsePreferences({
      crosshair: { style: 'star', size: 9999, thickness: 3, color: 'red' },
      targetColor: '#00ff00',
      fireButton: 17,
      hitSound: { on: 'yes', volume: 2 },
      practiceFov: 5,
    })
    expect(parsed).toEqual({
      ...defaultPreferences,
      crosshair: { ...defaultPreferences.crosshair, thickness: 3 },
      targetColor: '#00ff00',
    })
  })
})
