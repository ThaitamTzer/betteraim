import { useState } from 'react'
import { scenarios } from '../../core'
import type { ScenarioId } from '../../core'
import { newSeed } from '../defaults'
import { fmt } from '../format'
import type { Route, ScreenProps } from '../routes'

export function Practice({ route, go }: ScreenProps<'practice'>) {
  const { sensitivity, dpi, fov, gameProfileId } = route
  // One Practice Session per sitting: made when the picker opens from Home, carried through the Runs and the result screens
  // (`more` comes back here with it) and dropped when the player leaves Practice.
  const [sessionId] = useState(() => route.sessionId ?? crypto.randomUUID())

  // A fresh seed per Run; "Play again" on the result screen calls this again.
  const runRoute = (scenario: ScenarioId): Extract<Route, { name: 'run' }> => ({
    name: 'run',
    params: { scenario, seed: newSeed(), sensitivity, dpi, fov },
    meta: { gameProfileId, mode: 'practice', warmup: false, sessionId },
    next: (record) => ({ name: 'result', record, again: runRoute(scenario), more: { ...route, sessionId } }),
  })

  return (
    <main className="page">
      <p className="eyebrow">Practice</p>
      <h1>Pick a Scenario</h1>
      <p className="lede">
        Each Run lasts 30 seconds, at your Sensitivity of {fmt(sensitivity)} cm/360 and {dpi} DPI. Practice Runs never count
        toward the Sensitivity Finder.
      </p>
      <ul className="scenarios">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => go(runRoute(s.id))}>
              <b>{s.name}</b>
              <span>{s.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => go({ name: 'home' })}>
          Back
        </button>
      </div>
    </main>
  )
}
