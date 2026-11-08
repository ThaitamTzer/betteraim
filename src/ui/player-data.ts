import { ImportError, parsePlayerContext } from '../core'
import type { PlayerContext } from '../core'
import { loadPlayerContext, savePlayerContext } from './player-context'
import { loadPreferences, parsePreferences, savePreferences } from './preferences'
import type { Preferences } from './preferences'
import { loadSettings, parseSettings, saveSettings } from './settings'
import type { Settings } from './settings'

/**
 * The player's setup in the export file (the core's `PlayerData`): Settings (Game Profile, Game Sensitivity, DPI), Preferences and Player Context.
 * NEVER the AI Coach's settings: they hold API keys and stay in the browser they were typed in. `settings` is absent before onboarding.
 */
export type PlayerSetup = { settings?: Settings; preferences?: Preferences; playerContext?: PlayerContext }

export const readPlayerData = (): PlayerSetup => {
  const settings = loadSettings()
  return { ...(settings && { settings }), preferences: loadPreferences(), playerContext: loadPlayerContext() }
}

/**
 * The setup of an imported file, checked and normalised before anything is stored. A setup that is not plausible rejects the whole file;
 * Preferences and Player Context are read the way a saved copy is (a bad value falls back to its default). Other keys are dropped.
 */
export function checkPlayerData(data: Record<string, unknown>): PlayerSetup {
  const settings = data.settings === undefined ? undefined : parseSettings(data.settings)
  if (data.settings !== undefined && !settings) throw new ImportError('The setup in the file (game, Game Sensitivity and DPI) is not valid.')
  return {
    ...(settings && { settings }),
    ...(data.preferences !== undefined && { preferences: parsePreferences(data.preferences) }),
    ...(data.playerContext !== undefined && { playerContext: parsePlayerContext(data.playerContext) }),
  }
}

export function applyPlayerData({ settings, preferences, playerContext }: PlayerSetup): void {
  if (settings) saveSettings(settings)
  if (preferences) savePreferences(preferences)
  if (playerContext) savePlayerContext(playerContext)
}
