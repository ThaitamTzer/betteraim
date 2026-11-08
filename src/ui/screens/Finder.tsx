import { useEffect, useState } from 'react'
import { finderRunsFor, fitFinder, getGameProfile, nextSession } from '../../core'
import { errorMessage } from '../../error-message'
import { RAW_INPUT_BROWSERS, rawInputLikelySupported } from '../../input/pointer'
import { runStore } from '../../storage/runs'
import { newSeed } from '../defaults'
import { centreOf, MIN_REST_SECONDS, newFinderSession, runRoute } from '../finder'
import type { FinderSession } from '../finder'
import { nextView } from '../finder-result'
import type { ScreenProps } from '../routes'
import { loadSettings } from '../settings'

type Planned = { session: FinderSession; phase: string } | { error: string } | null

/** Entry of the Sensitivity Finder: what a Session is, then Start. Raw input is verified for real when the first Run locks the pointer. */
export function Finder({ go }: ScreenProps<'finder'>) {
  const [settings] = useState(loadSettings)
  // One Session per visit to this screen, planned now (from the Runs so far: coarse, fine or shifted) so the copy can state its size.
  const [planned, setPlanned] = useState<Planned>(null)
  useEffect(() => {
    if (!settings) go({ name: 'onboarding' })
  }, [settings, go])
  // Not keyed on `go` (a new function on every App render): that would plan another Session, with a new seed, each time.
  useEffect(() => {
    if (!settings) return
    let current = true
    void (async () => {
      const { runs, exclude } = await finderRunsFor(await runStore(), settings.gameProfileId)
      const next = nextSession(fitFinder(runs, { weights: getGameProfile(settings.gameProfileId).weights, exclude }), centreOf(settings))
      return { session: newFinderSession(settings, newSeed(), crypto.randomUUID(), next), phase: nextView(next) }
    })().then(
      (result) => current && setPlanned(result),
      (error: unknown) => current && setPlanned({ error: errorMessage(error) }),
    )
    return () => {
      current = false
    }
  }, [settings])
  if (!settings) return <></>
  if (!planned) return <main className="page"><p className="lede">Planning your Session...</p></main>
  if ('error' in planned) {
    return (
      <main className="page">
        <p className="warning" role="alert">Your Runs could not be read, so the Session could not be planned: {planned.error}</p>
        <div className="actions">
          <button type="button" onClick={() => go({ name: 'home' })}>Back</button>
        </div>
      </main>
    )
  }
  const { session, phase } = planned

  const total = session.plan.length
  const minutes = Math.round((total * 30 + (total - 1) * MIN_REST_SECONDS) / 60)

  return (
    <main className="page">
      <p className="eyebrow">Sensitivity Finder</p>
      <h1>Find the Sensitivity you aim best with.</h1>
      <p className="lede">
        A Session takes about {minutes} minutes: {total} Runs of 30 seconds with a rest between each, in {getGameProfile(session.gameProfileId).name}&apos;s
        field of view. The first 2 are Warm-up Runs and do not count. The rest play 2 Scenarios, each at {session.levels} different Sensitivities, in a
        shuffled order.
      </p>
      <p className="lede">This Session: {phase}</p>
      <p className="lede">
        You are never told which Sensitivity a Run uses, so what you expect cannot change how you play. Every finished Run is saved.
      </p>

      {!rawInputLikelySupported() && (
        <p className="warning" role="status">
          This browser may not give raw mouse input. The Finder checks when your first Run starts and stops if it does not. Raw input works in:{' '}
          {RAW_INPUT_BROWSERS}
        </p>
      )}

      <p className="hint">
        Keep your browser zoom at 100%. Press Escape during a Run to abandon that Run; you can then resume the Session or quit it.
      </p>

      <div className="actions">
        <button type="button" className="primary" onClick={() => go(runRoute(session))} autoFocus>
          Start Session
        </button>
        <button type="button" onClick={() => go({ name: 'home' })}>
          Back
        </button>
      </div>
    </main>
  )
}
