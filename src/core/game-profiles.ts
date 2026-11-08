import { verticalFovDeg } from './aim'
import type { Cm360, Fov } from './types'

// Where each yaw, vertical multiplier, default and FOV below comes from, and how sure it is: docs/research/game-profiles.md.

/** 360 degrees x 2.54 cm per inch: cm/360 = CM_360 / (yaw x Game Sensitivity x DPI). */
const CM_360 = 914.4

export type GameProfileId = 'valorant' | 'cs2' | 'apex' | 'overwatch2' | 'fortnite' | 'r6' | 'cod'

/** A game's FOV as its settings state it. A horizontal FOV is measured on a 4:3 or 16:9 screen; a vertical one needs no base. */
export type GameFov = { degrees: number; axis: 'horizontal'; base: '4:3' | '16:9' } | { degrees: number; axis: 'vertical' }

export interface GameProfile {
  id: GameProfileId
  name: string
  /** Degrees the view turns per mouse count at Game Sensitivity 1. */
  yaw: number
  /**
   * The game's separate vertical setting, if it has one. Inside BetterAim vertical equals horizontal (1:1), which is
   * the same number as Game Sensitivity for a `sensitivity` setting and 1 for a `multiplier`.
   */
  vertical?: { label: string; kind: 'sensitivity' | 'multiplier' }
  fov: GameFov
  /** A typical starting Game Sensitivity: the feel of Valorant 0.4 at 800 DPI (40.8 cm/360), rounded to what the game accepts. */
  defaultSensitivity: number
  /** Share of Clicking vs Tracking Scenarios in a Finder Session (spec table); sums to 1. */
  weights: { clicking: number; tracking: number }
  /** Shown next to results for this game. */
  note?: string
}

// Yaw: only Valve documents its value (the `m_yaw` cvar). The rest are community measurements, identical in every table
// consulted. KovaaK's "Sens Scale" constants, read from https://github.com/ARm8-2/refleks internal/constants/defaults.go:
// Source 0.022 (CS, Apex), Overwatch 0.0066 (OW, CoD), Valorant 0.06996, Fortnite 0.005555, Siege 0.018 / pi.
// Cross-checked against https://github.com/pzxe/Aimless src/data/games/games.ts, https://github.com/tedgey/find-your-sens
// src/math/games.ts and https://github.com/zxpeng2007/omnisens web/js/games.js.
// FOV: converted to a vertical FOV by `profileFov`; the community sources below give horizontal values on a 4:3 or 16:9 screen.
export const gameProfiles: readonly GameProfile[] = [
  {
    id: 'valorant',
    name: 'Valorant',
    yaw: 0.07, // every table says 0.07; KovaaK's measured 0.06996 (0.06 % apart, below any display precision)
    // 103 horizontal on 16:9, fixed, no slider: https://fovcalculatorpro.com/games/valorant-fov/ (70.53 vertical)
    fov: { degrees: 103, axis: 'horizontal', base: '16:9' },
    defaultSensitivity: 0.4,
    weights: { clicking: 0.7, tracking: 0.3 },
  },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    yaw: 0.022, // Valve's `m_yaw` default; `m_pitch` is the same, so vertical is 1:1 with no setting for it
    // 90 horizontal on a 4:3 screen (about 106 on 16:9), like every Source game; community statement, Valve wiki not
    // reachable: https://developer.valvesoftware.com/wiki/Field_of_View
    fov: { degrees: 90, axis: 'horizontal', base: '4:3' },
    defaultSensitivity: 1.27,
    weights: { clicking: 0.7, tracking: 0.3 },
  },
  {
    id: 'apex',
    name: 'Apex Legends',
    yaw: 0.022, // Source engine family, KovaaK's Source constant (refleks, above)
    // Slider default 70 is cl_fovScale 1.0 = 70 horizontal on 4:3 (cvar default seen in https://github.com/240hz/ApexConfigs
    // cvar.txt). The slider is not degrees: 110 is 108.5 on 4:3 (https://github.com/ThelzenGroup/apex-aim-trainer
    // src/core/apex_sensitivity.gd, https://keymap.io/fov-converter/). Low-medium confidence; Options can override FOV.
    fov: { degrees: 70, axis: 'horizontal', base: '4:3' },
    defaultSensitivity: 1.27,
    weights: { clicking: 0.3, tracking: 0.7 },
  },
  {
    id: 'overwatch2',
    name: 'Overwatch 2',
    yaw: 0.0066, // KovaaK's Overwatch constant (refleks, above)
    // Slider 80-103, default taken as 103 horizontal on 16:9: https://fovcalculatorpro.com/games/overwatch-2-fov/. Low
    // confidence: one calculator site calls the slider vertical and another default 90, neither internally consistent.
    fov: { degrees: 103, axis: 'horizontal', base: '16:9' },
    defaultSensitivity: 4.24,
    weights: { clicking: 0.3, tracking: 0.7 },
  },
  {
    id: 'fortnite',
    name: 'Fortnite',
    yaw: 0.005555, // per 1 % of X sensitivity, KovaaK's Fortnite constant (refleks, above); Epic documents nothing
    // The Y-axis setting uses the same scale per %, so 1:1 is the same percent (medium-low confidence).
    vertical: { label: 'Y-axis sensitivity (%)', kind: 'sensitivity' },
    // Default 80, locked, horizontal on 16:9: https://charlieintel.com/fortnite/can-you-change-fov-in-fortnite-284275,
    // https://fovcalculatorpro.com/. One calculator lists it as vertical; most sources say horizontal.
    fov: { degrees: 80, axis: 'horizontal', base: '16:9' },
    defaultSensitivity: 5,
    weights: { clicking: 0.5, tracking: 0.5 },
    note: 'Type the percent the menu shows, not the value stored in the config file.',
  },
  {
    id: 'r6',
    name: 'Rainbow Six Siege',
    yaw: 0.018 / Math.PI, // 0.00572957795 per slider point at the default MouseSensitivityMultiplierUnit 0.02; KovaaK's (refleks)
    // Ubisoft publishes the formulas, not this constant, and does not say the vertical slider differs from the horizontal one:
    // https://www.ubisoft.com/en-au/game/rainbow-six/siege/news-updates/6kY6b5JByBY3P6vQWWinla/fov-and-input-sensitivity
    vertical: { label: 'Vertical sensitivity', kind: 'sensitivity' },
    // Vertical FOV, slider 60-90, default 60 (GameSettings.ini "DefaultFOV => Default vertical field of view"):
    // https://github.com/cjLGH/game-settings/blob/master/r6siege/GameSettings.ini
    fov: { degrees: 60, axis: 'vertical' },
    defaultSensitivity: 5,
    weights: { clicking: 0.7, tracking: 0.3 },
    note: 'The slider only takes whole numbers, so round the result.',
  },
  {
    id: 'cod',
    name: 'Call of Duty (MW4 / Warzone)',
    yaw: 0.0066, // KovaaK's Overwatch constant, shared by the whole IW family (refleks); MW4 itself is not documented
    vertical: { label: 'Vertical sensitivity multiplier', kind: 'multiplier' },
    // Default 80 horizontal on 16:9 (the PC slider reaches 120):
    // https://www.esportstales.com/call-of-duty/best-fov-field-of-view-modern-warfare-and-warzone
    fov: { degrees: 80, axis: 'horizontal', base: '16:9' },
    defaultSensitivity: 4.24,
    weights: { clicking: 0.5, tracking: 0.5 },
  },
]

export const isGameProfileId = (id: string): id is GameProfileId => gameProfiles.some((p) => p.id === id)

export const getGameProfile = (id: GameProfileId): GameProfile => {
  const found = gameProfiles.find((p) => p.id === id)
  if (!found) throw new Error(`Unknown Game Profile: ${id}`)
  return found
}

/** cm/360 = 914.4 / (yaw x Game Sensitivity x DPI). */
export const cm360For = (id: GameProfileId, gameSensitivity: number, dpi: number): Cm360 =>
  CM_360 / (getGameProfile(id).yaw * gameSensitivity * dpi)

/** The Game Sensitivity that gives `cm360` at `dpi` (the same formula solved for it). */
export const gameSensitivityFor = (id: GameProfileId, cm360: Cm360, dpi: number): number =>
  CM_360 / (getGameProfile(id).yaw * cm360 * dpi)

export const eDpi = (gameSensitivity: number, dpi: number): number => gameSensitivity * dpi

/** One game's Sensitivity in every form the player compares: Game Sensitivity, its vertical setting, eDPI and cm/360. */
export interface SensitivityReading {
  game: GameProfileId
  gameSensitivity: number
  vertical?: { label: string; value: number }
  eDpi: number
  cm360: Cm360
}

export const readSensitivity = (id: GameProfileId, gameSensitivity: number, dpi: number): SensitivityReading => {
  const { vertical } = getGameProfile(id)
  return {
    game: id,
    gameSensitivity,
    ...(vertical && { vertical: { label: vertical.label, value: vertical.kind === 'multiplier' ? 1 : gameSensitivity } }),
    eDpi: eDpi(gameSensitivity, dpi),
    cm360: cm360For(id, gameSensitivity, dpi),
  }
}

/** The same cm/360 (360 degree distance matching) expressed as a Game Sensitivity of another game. */
export const convertSensitivity = (from: GameProfileId, to: GameProfileId, gameSensitivity: number, dpi: number): SensitivityReading =>
  readSensitivity(to, gameSensitivityFor(to, cm360For(from, gameSensitivity, dpi), dpi), dpi)

const ASPECT = { '4:3': 4 / 3, '16:9': 16 / 9 }

/**
 * The FOV a Run is rendered with. Always vertical: a horizontal FOV measured on its base aspect is converted to the
 * vertical FOV of that screen, so the vertical FOV stays fixed and the horizontal one grows with the window (Hor+, as
 * Source, Valorant, Apex, Overwatch and Siege do). Games that hold horizontal FOV instead are not modelled.
 */
export const profileFov = (id: GameProfileId): Fov => {
  const { fov } = getGameProfile(id)
  const degrees = fov.axis === 'vertical' ? fov.degrees : verticalFovDeg({ degrees: fov.degrees, axis: 'horizontal' }, ASPECT[fov.base])
  return { degrees, axis: 'vertical' }
}

/**
 * Practice only: the player's own FOV from Options (`horizontal` degrees on a 16:9 screen) when set, else `profileFov(id)`.
 * The Sensitivity Finder (#9) must call `profileFov(id)` directly and never this, so every Finder Run uses the Game Profile FOV.
 */
export const practiceFov = (id: GameProfileId, horizontal?: number | null): Fov =>
  horizontal == null
    ? profileFov(id)
    : { degrees: verticalFovDeg({ degrees: horizontal, axis: 'horizontal' }, ASPECT['16:9']), axis: 'vertical' }
