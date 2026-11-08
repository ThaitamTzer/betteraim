import { useEffect, useState } from 'react'
import { cm360For, degreesPerCount, eDpi, getGameProfile, practiceFov } from '../../core'
import { RAW_INPUT_BROWSERS, rawInputLikelySupported } from '../../input/pointer'
import { fmt } from '../format'
import type { ScreenProps } from '../routes'
import { loadPreferences } from '../preferences'
import { loadSettings } from '../settings'

export function Home({ go }: ScreenProps<'home'>) {
  const [settings] = useState(loadSettings)
  // A first visit has no settings yet: onboarding comes first.
  useEffect(() => {
    if (!settings) go({ name: 'onboarding' })
  }, [settings, go])
  if (!settings) return <></>

  const { gameProfileId, gameSensitivity, dpi } = settings
  const game = getGameProfile(gameProfileId)
  const sensitivity = cm360For(gameProfileId, gameSensitivity, dpi)

  return (
    <main className="page">
      <h1>Find the Sensitivity you aim best with.</h1>
      <p className="lede">
        A free aim trainer in your browser. Practice a Scenario with your {game.name} setup and see your Score.
      </p>

      {!rawInputLikelySupported() && (
        <p className="warning" role="status">
          This browser may not give raw mouse input, so the OS can accelerate your mouse and distort results. Raw input works
          in: {RAW_INPUT_BROWSERS} You can still play.
        </p>
      )}

      <dl className="stats">
        <div>
          <dt>Game Sensitivity</dt>
          <dd>{fmt(gameSensitivity)}</dd>
        </div>
        <div>
          <dt>Mouse DPI</dt>
          <dd>{dpi}</dd>
        </div>
        <div>
          <dt>Sensitivity (cm/360)</dt>
          <dd>{fmt(sensitivity)}</dd>
        </div>
      </dl>
      <p className="hint">
        {game.name} at eDPI {fmt(eDpi(gameSensitivity, dpi))}. Each mouse count turns the view{' '}
        {degreesPerCount(sensitivity, dpi).toFixed(4)} degrees.
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => go({ name: 'finder' })}>
          Sensitivity Finder
        </button>
        <button type="button" onClick={() => go({ name: 'finderResult', gameProfileId, dpi })}>
          Finder result
        </button>
        <button
          type="button"
          // Practice is the only place the FOV override applies; Finder Runs must use `profileFov(id)`.
          onClick={() =>
            go({ name: 'practice', sensitivity, dpi, fov: practiceFov(gameProfileId, loadPreferences().practiceFov), gameProfileId })
          }
        >
          Practice
        </button>
        <button type="button" onClick={() => go({ name: 'converter' })}>
          Converter
        </button>
        <button type="button" onClick={() => go({ name: 'options' })}>
          Options
        </button>
        <button type="button" onClick={() => go({ name: 'onboarding' })}>
          Change setup
        </button>
      </div>
    </main>
  )
}
