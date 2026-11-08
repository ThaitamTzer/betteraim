import { useEffect, useState } from 'react'
import { cm360For, convertSensitivity, eDpi, getGameProfile } from '../../core'
import type { GameProfileId } from '../../core'
import { createHitSound } from '../../audio/hit-sound'
import { CoachSection } from '../CoachSection'
import { Crosshair } from '../Crosshair'
import { CheckField, ColorField, GameSelect, NumberField, RangeField, Select } from '../fields'
import { fmt } from '../format'
import { loadPreferences, RANGES, savePreferences } from '../preferences'
import type { Preferences } from '../preferences'
import type { ScreenProps } from '../routes'
import { loadSettings, saveSettings, validSetup } from '../settings'
import '../options.css'

type SectionProps = { prefs: Preferences; update: (patch: Partial<Preferences>) => void }

/**
 * Every section is independent and saves itself, so a new one (AI Coach, Player Context) is a component plus one line
 * in the list below. Preference sections save as you change them; the setup has a Save button because DPI, Game
 * Sensitivity and game only make sense together.
 */
export function Options({ go }: ScreenProps<'options'>) {
  const [prefs, setPrefs] = useState(loadPreferences)
  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePreferences(next)
  }
  return (
    <main className="page options">
      <p className="eyebrow">Options</p>
      <h1>Make it yours.</h1>
      <p className="lede">Choices are saved in this browser as you make them. Your setup has its own Save button.</p>

      <SetupSection />
      <CrosshairSection prefs={prefs} update={update} />
      <TargetSection prefs={prefs} update={update} />
      <ControlsSection prefs={prefs} update={update} />
      <HitSoundSection prefs={prefs} update={update} />
      <FovSection prefs={prefs} update={update} />
      <CoachSection />

      <div className="actions">
        <button type="button" onClick={() => go({ name: 'home' })}>
          Back
        </button>
      </div>
    </main>
  )
}

/** Game, Game Sensitivity and DPI: what Home and Practice turn into the player's Sensitivity (cm/360). */
function SetupSection() {
  const [saved, setSaved] = useState(loadSettings)
  const [game, setGame] = useState<GameProfileId>(saved?.gameProfileId ?? 'valorant')
  const [sens, setSens] = useState(String(saved?.gameSensitivity ?? getGameProfile(game).defaultSensitivity))
  const [dpi, setDpi] = useState(String(saved?.dpi ?? 800))
  const gameSensitivity = Number(sens)
  const mouseDpi = Number(dpi)
  const valid = validSetup(game, gameSensitivity, mouseDpi)
  const changed = !saved || saved.gameProfileId !== game || saved.gameSensitivity !== gameSensitivity || saved.dpi !== mouseDpi

  return (
    <section>
      <h2>Your setup</h2>
      <form
        className="setup"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          const next = { gameProfileId: game, gameSensitivity, dpi: mouseDpi }
          saveSettings(next)
          setSaved(next)
        }}
      >
        <GameSelect
          label="Game"
          value={game}
          onChange={(id) => {
            // Keep the player's cm/360 (as the Converter does) so switching game does not change their Sensitivity.
            setSens(valid ? fmt(convertSensitivity(game, id, gameSensitivity, mouseDpi).gameSensitivity) : String(getGameProfile(id).defaultSensitivity))
            setGame(id)
          }}
        />
        <NumberField label="Game Sensitivity" value={sens} onChange={setSens} />
        <NumberField label="Mouse DPI" unit="DPI" value={dpi} onChange={setDpi} />
        <p className="hint" role="status">
          {valid
            ? `${changed ? '' : 'Saved. '}That is ${fmt(cm360For(game, gameSensitivity, mouseDpi))} cm/360 (eDPI ${fmt(eDpi(gameSensitivity, mouseDpi))}).`
            : 'Enter a DPI from 100 to 32000 and a Game Sensitivity that works out to between 0.1 and 1000 cm/360.'}
        </p>
        <div className="actions">
          <button type="submit" className="primary" disabled={!valid || !changed}>
            Save setup
          </button>
        </div>
      </form>
    </section>
  )
}

function CrosshairSection({ prefs, update }: SectionProps) {
  const c = prefs.crosshair
  const set = (patch: Partial<Preferences['crosshair']>) => update({ crosshair: { ...c, ...patch } })
  const cross = c.style === 'cross'
  return (
    <section>
      <h2>Crosshair</h2>
      <div className="preview" aria-hidden="true">
        <Crosshair crosshair={c} />
      </div>
      <div className="setup">
        <Select
          label="Style"
          value={c.style}
          choices={[
            ['cross', 'Cross'],
            ['dot', 'Dot'],
          ]}
          onChange={(style) => set({ style })}
        />
        <RangeField label={cross ? 'Arm length' : 'Dot size'} unit=" px" value={c.size} range={RANGES.size} onChange={(size) => set({ size })} />
        <RangeField label="Thickness" unit=" px" value={c.thickness} range={RANGES.thickness} disabled={!cross} onChange={(thickness) => set({ thickness })} />
        <RangeField label="Centre gap" unit=" px" value={c.gap} range={RANGES.gap} disabled={!cross} onChange={(gap) => set({ gap })} />
        <RangeField label="Opacity" value={c.opacity} range={RANGES.opacity} step={0.05} onChange={(opacity) => set({ opacity })} />
        <ColorField label="Colour" value={c.color} onChange={(color) => set({ color })} />
      </div>
    </section>
  )
}

function TargetSection({ prefs, update }: SectionProps) {
  return (
    <section>
      <h2>Targets</h2>
      <div className="setup">
        <ColorField label="Target colour" value={prefs.targetColor} onChange={(targetColor) => update({ targetColor })} />
      </div>
    </section>
  )
}

const BUTTONS = [
  [0, 'Left button'],
  [1, 'Middle button'],
  [2, 'Right button'],
  [3, 'Back button'],
  [4, 'Forward button'],
] as const

function ControlsSection({ prefs, update }: SectionProps) {
  return (
    <section>
      <h2>Controls</h2>
      <div className="setup">
        <Select label="Fire" value={prefs.fireButton} choices={BUTTONS} onChange={(fireButton) => update({ fireButton })} />
        <p className="hint">
          Escape always releases your mouse and abandons the Run. Runs are recorded as if you fired with the left button, whatever you
          pick.
        </p>
      </div>
    </section>
  )
}

function HitSoundSection({ prefs, update }: SectionProps) {
  const { on, volume } = prefs.hitSound
  const [sound] = useState(createHitSound)
  useEffect(() => () => sound.close(), [sound])
  const set = (patch: Partial<Preferences['hitSound']>) => update({ hitSound: { on, volume, ...patch } })
  return (
    <section>
      <h2>Hit sound</h2>
      <div className="setup">
        <CheckField label="Play a sound when a target is hit" checked={on} onChange={(checked) => set({ on: checked })} />
        <RangeField label="Volume" unit="%" value={Math.round(volume * 100)} range={[0, 100]} disabled={!on} onChange={(v) => set({ volume: v / 100 })} />
        <div className="actions">
          <button
            type="button"
            disabled={!on}
            onClick={() => {
              sound.prime()
              sound.play(volume)
            }}
          >
            Play sample
          </button>
        </div>
      </div>
    </section>
  )
}

function FovSection({ prefs, update }: SectionProps) {
  const [min, max] = RANGES.fov
  const [text, setText] = useState(prefs.practiceFov === null ? '' : String(prefs.practiceFov))
  const typed = Number(text)
  const bad = text.trim() !== '' && !(typed >= min && typed <= max)
  return (
    <section>
      <h2>Practice field of view</h2>
      <div className="setup">
        <NumberField
          label="Horizontal FOV"
          unit="°"
          value={text}
          onChange={(v) => {
            setText(v)
            if (v.trim() === '') update({ practiceFov: null })
            else if (Number(v) >= min && Number(v) <= max) update({ practiceFov: Number(v) })
          }}
        />
        <p className="hint">
          {bad
            ? `Enter ${min} to ${max} degrees, or clear the field.`
            : "Degrees across a 16:9 screen. Leave it empty to practise with your game's own field of view. This applies to Practice only: the Sensitivity Finder always uses your game's, so its results stay comparable."}
        </p>
      </div>
    </section>
  )
}
