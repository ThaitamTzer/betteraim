import { useState } from 'react'
import { cm360For, eDpi, getGameProfile } from '../../core'
import type { GameProfileId } from '../../core'
import { GameSelect, NumberField } from '../fields'
import { fmt } from '../format'
import type { ScreenProps } from '../routes'
import { loadSettings, saveSettings, validSetup } from '../settings'

/** First visit (and "Change setup"): pick the game, then enter its Game Sensitivity and your DPI, or keep the default. */
export function Onboarding({ go }: ScreenProps<'onboarding'>) {
  const [saved] = useState(loadSettings)
  const [game, setGame] = useState<GameProfileId>(saved?.gameProfileId ?? 'valorant')
  const [sens, setSens] = useState(String(saved?.gameSensitivity ?? getGameProfile(game).defaultSensitivity))
  const [dpi, setDpi] = useState(String(saved?.dpi ?? 800))
  const profile = getGameProfile(game)
  const gameSensitivity = Number(sens)
  const mouseDpi = Number(dpi)
  const valid = validSetup(game, gameSensitivity, mouseDpi)

  return (
    <main className="page">
      <h1>{saved ? 'Change your setup' : 'Set up your game.'}</h1>
      <p className="lede">
        Pick the game you play and enter its sensitivity and your mouse DPI. BetterAim trains with that game&apos;s field of view and
        works in cm/360, so the same feel carries across games.
      </p>

      <form
        className="setup"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          saveSettings({ gameProfileId: game, gameSensitivity, dpi: mouseDpi })
          go({ name: 'home' })
        }}
      >
        <GameSelect
          label="Game"
          value={game}
          onChange={(id) => {
            setGame(id)
            setSens(String(getGameProfile(id).defaultSensitivity)) // a value from another game means something else here
          }}
        />
        <NumberField label="Game Sensitivity" value={sens} onChange={setSens} />
        <p className="hint">
          Filled with a typical starting value for {profile.name}. Replace it with the number from your game&apos;s settings.
          {profile.note && ` ${profile.note}`}
        </p>
        <NumberField label="Mouse DPI" unit="DPI" value={dpi} onChange={setDpi} />
        <p className="hint">
          {valid
            ? `That is ${fmt(cm360For(game, gameSensitivity, mouseDpi))} cm/360 (eDPI ${fmt(eDpi(gameSensitivity, mouseDpi))}).`
            : 'Enter a DPI from 100 to 32000 and a Game Sensitivity that works out to between 0.1 and 1000 cm/360.'}
        </p>
        <div className="actions">
          <button type="submit" className="primary" disabled={!valid}>
            {saved ? 'Save' : 'Continue'}
          </button>
          {saved && (
            <button type="button" onClick={() => go({ name: 'home' })}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </main>
  )
}
