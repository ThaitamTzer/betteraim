import { describe, expect, it } from 'vitest'
import { verticalFovDeg } from './aim'
import {
  cm360For,
  convertSensitivity,
  gameProfiles,
  gameSensitivityFor,
  getGameProfile,
  profileFov,
  readSensitivity,
} from './game-profiles'

describe('Game Sensitivity <-> cm/360', () => {
  it('Valorant 0.4 at 800 DPI is about 40.8 cm/360', () => {
    expect(cm360For('valorant', 0.4, 800)).toBeCloseTo(40.8, 1)
  })

  it('CS2 needs about 3.18x the Game Sensitivity of Valorant for the same cm/360, whatever the DPI', () => {
    for (const dpi of [400, 800, 1600]) {
      const ratio = gameSensitivityFor('cs2', 30, dpi) / gameSensitivityFor('valorant', 30, dpi)
      expect(ratio).toBeCloseTo(3.18, 2)
    }
  })

  it('is lossless in both directions for every game and DPI', () => {
    for (const { id } of gameProfiles) {
      for (const dpi of [400, 800, 1600, 3200]) {
        expect(cm360For(id, gameSensitivityFor(id, 27.5, dpi), dpi)).toBeCloseTo(27.5, 9)
      }
    }
  })

  it('keeps eDPI constant across DPI within one game for the same cm/360', () => {
    for (const { id } of gameProfiles) {
      const edpi = (dpi: number) => dpi * gameSensitivityFor(id, 27.5, dpi)
      for (const dpi of [400, 1600, 3200]) expect(edpi(dpi)).toBeCloseTo(edpi(800), 9)
    }
  })

  it('rejects ids that are not a Game Profile', () => {
    expect(() => getGameProfile('quake' as never)).toThrow()
  })
})

describe('Converter', () => {
  it('keeps cm/360 and reports eDPI for the target game', () => {
    const cs2 = convertSensitivity('valorant', 'cs2', 0.4, 800)
    expect(cs2.gameSensitivity).toBeCloseTo(1.273, 3)
    expect(cs2.cm360).toBeCloseTo(cm360For('valorant', 0.4, 800), 9)
    expect(cs2.eDpi).toBeCloseTo(1018.2, 1)
  })

  it('round-trips between any two games without loss', () => {
    for (const a of gameProfiles) {
      for (const b of gameProfiles) {
        const there = convertSensitivity(a.id, b.id, 0.731, 1600)
        expect(convertSensitivity(b.id, a.id, there.gameSensitivity, 1600).gameSensitivity).toBeCloseTo(0.731, 9)
      }
    }
  })

  it('gives the vertical setting that matches 1:1 only for games that have one', () => {
    expect(readSensitivity('valorant', 0.4, 800).vertical).toBeUndefined()
    expect(readSensitivity('fortnite', 6.4, 800).vertical?.value).toBe(6.4)
    expect(readSensitivity('r6', 12, 800).vertical?.value).toBe(12)
    expect(readSensitivity('cod', 4.2, 800).vertical?.value).toBe(1)
  })
})

describe('Game Profile table', () => {
  it('covers the seven supported games with the spec weights', () => {
    const clicking = Object.fromEntries(gameProfiles.map((p) => [p.id, p.weights.clicking]))
    expect(clicking).toEqual({ valorant: 0.7, cs2: 0.7, r6: 0.7, overwatch2: 0.3, apex: 0.3, fortnite: 0.5, cod: 0.5 })
    for (const p of gameProfiles) expect(p.weights.clicking + p.weights.tracking).toBeCloseTo(1, 12)
  })

  it('has a default Game Sensitivity that feels like about 41 cm/360 at 800 DPI in every game', () => {
    for (const p of gameProfiles) {
      const cm = cm360For(p.id, p.defaultSensitivity, 800)
      expect(cm, p.id).toBeGreaterThan(38)
      expect(cm, p.id).toBeLessThan(43)
    }
  })
})

describe('profileFov', () => {
  it('turns each game FOV into the vertical FOV of its base screen', () => {
    expect(profileFov('cs2').axis).toBe('vertical')
    expect(profileFov('cs2').degrees).toBeCloseTo(73.74, 2) // 90 horizontal on 4:3
    expect(profileFov('valorant').degrees).toBeCloseTo(70.53, 2) // 103 horizontal on 16:9
    expect(profileFov('fortnite').degrees).toBeCloseTo(50.53, 2) // 80 horizontal on 16:9
    expect(profileFov('apex').degrees).toBeCloseTo(55.41, 2) // 70 horizontal on 4:3
    expect(profileFov('r6').degrees).toBe(60) // already vertical
  })

  it('keeps the vertical FOV fixed whatever the window, so CS2 is 106.26 horizontal on 16:9', () => {
    const fov = profileFov('cs2')
    expect(verticalFovDeg(fov, 21 / 9)).toBeCloseTo(fov.degrees, 12)
    const horizontal = 2 * Math.atan(Math.tan((fov.degrees * Math.PI) / 360) * (16 / 9)) * (180 / Math.PI)
    expect(horizontal).toBeCloseTo(106.26, 2)
  })
})
