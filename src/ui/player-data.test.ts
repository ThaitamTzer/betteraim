import { describe, expect, it } from 'vitest'
import { ImportError } from '../core'
import { applyPlayerData, checkPlayerData, readPlayerData } from './player-data'
import { defaultPreferences } from './preferences'
import { loadSettings } from './settings'

const setup = { settings: { gameProfileId: 'cs2', gameSensitivity: 1.2, dpi: 1600 }, preferences: { ...defaultPreferences, targetColor: '#ff0000', fireButton: 2 }, playerContext: { role: 'entry' } }

describe("the player's setup in an export file", () => {
  it('reads back what was applied: Settings, Preferences and Player Context, and nothing else (no AI Coach settings)', () => {
    applyPlayerData(checkPlayerData(JSON.parse(JSON.stringify(setup))))
    const read = readPlayerData()
    expect(read).toEqual(setup)
    expect(Object.keys(read).sort()).toEqual(['playerContext', 'preferences', 'settings'])
    expect(loadSettings()).toEqual(setup.settings)
  })

  it('drops keys it does not know, such as AI Coach settings that came in the file', () => {
    const checked = checkPlayerData({ ...setup, coach: { anthropic: { apiKey: 'SECRET' } }, apiKey: 'SECRET' })
    expect(JSON.stringify(checked)).not.toContain('SECRET')
    expect(Object.keys(checked).sort()).toEqual(['playerContext', 'preferences', 'settings'])
  })

  it('rejects a setup nobody could have, so the whole file is refused', () => {
    for (const settings of [{ gameProfileId: 'quake', gameSensitivity: 1, dpi: 800 }, { gameProfileId: 'cs2', gameSensitivity: 1, dpi: 5 }, { gameProfileId: 'cs2', gameSensitivity: -1, dpi: 800 }, 'cs2', null, []]) {
      expect(() => checkPlayerData({ ...setup, settings })).toThrow(ImportError)
    }
  })

  it('accepts a file with only some of it, and reads Preferences like a saved copy (a bad value gets its default)', () => {
    expect(checkPlayerData({})).toEqual({})
    const { preferences } = checkPlayerData({ preferences: { targetColor: '#00ff00', fireButton: 99 } })
    expect(preferences).toEqual({ ...defaultPreferences, targetColor: '#00ff00' })
  })
})
