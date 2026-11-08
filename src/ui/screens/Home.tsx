import { useEffect, useState } from 'react'
import { cm360For, degreesPerCount, eDpi, getGameProfile, getScenario, profileFov } from '../../core'
import { rawInputLikelySupported } from '../../input/pointer'
import { newSeed } from '../defaults'
import { fmt } from '../format'
import type { Route, ScreenProps } from '../routes'
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

  // A fresh seed per Run; "Play again" on the result screen calls this again.
  const runRoute = (): Extract<Route, { name: 'run' }> => ({
    name: 'run',
    params: { scenario: getScenario('flick').id, seed: newSeed(), sensitivity, dpi, fov: profileFov(gameProfileId) },
    meta: { gameProfileId, mode: 'practice', warmup: false, sessionId: crypto.randomUUID() },
    next: (record) => ({ name: 'result', record, again: runRoute() }),
  })

  return (
    <main className="page">
      <h1>Find the sensitivity you aim best with.</h1>
      <p className="lede">
        A free aim trainer in your browser. Play a 30 second Flick Run with your {game.name} setup and see your Score.
      </p>

      {!rawInputLikelySupported() && (
        <p className="warning" role="status">
          This browser may not give raw mouse input, so the OS can accelerate your mouse and distort results. Chrome, Edge
          and other Chromium browsers support raw input. You can still play.
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
        <button type="button" className="primary" onClick={() => go(runRoute())}>
          Play Flick
        </button>
        <button type="button" onClick={() => go({ name: 'converter' })}>
          Converter
        </button>
        <button type="button" onClick={() => go({ name: 'onboarding' })}>
          Change setup
        </button>
      </div>
    </main>
  )
}
