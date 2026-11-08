import { useEffect, useState } from 'react'
import { getGameProfile } from '../../core'
import { rawInputLikelySupported } from '../../input/pointer'
import { newSeed } from '../defaults'
import { MIN_REST_SECONDS, newFinderSession, RAW_INPUT_BROWSERS, runRoute } from '../finder'
import type { ScreenProps } from '../routes'
import { loadSettings } from '../settings'

/** Entry of the Sensitivity Finder: what a Session is, then Start. Raw input is verified for real when the first Run locks the pointer. */
export function Finder({ go }: ScreenProps<'finder'>) {
  const [settings] = useState(loadSettings)
  // One Session per visit to this screen, planned now so the copy can state its size.
  const [session] = useState(() => settings && newFinderSession(settings, newSeed(), crypto.randomUUID()))
  useEffect(() => {
    if (!settings) go({ name: 'onboarding' })
  }, [settings, go])
  if (!settings || !session) return <></>

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
