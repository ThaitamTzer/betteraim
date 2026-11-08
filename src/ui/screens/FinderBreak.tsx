import { useEffect, useRef, useState } from 'react'
import { getScenario } from '../../core'
import { saveOutcome } from '../../storage/runs'
import { MIN_REST_SECONDS, runRoute, stepView } from '../finder'
import type { ScreenProps } from '../routes'
import { formatScore } from '../score'
import '../finder.css'

/**
 * Every screen between the Runs of a Finder Session (rest, abandoned Run, no raw input, complete). It prints only
 * `stepView` and the last Score, never a Sensitivity, and the topbar is hidden while it shows (App.tsx).
 */
export function FinderBreak({ route, go }: ScreenProps<'finderSession'>) {
  const { session, step, last } = route
  const view = stepView(session, step)
  const [rested, setRested] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const waiting = step === 'rest' && rested < MIN_REST_SECONDS

  useEffect(() => {
    if (step !== 'rest') return
    const timer = setInterval(() => setRested((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [step])
  useEffect(() => {
    if (!waiting) primary.current?.focus()
  }, [waiting])
  // A Finder Run has no result screen, so a failed save has to be reported here.
  useEffect(() => {
    if (last) saveOutcome(last.id)?.catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
  }, [last])

  const home = () => go({ name: 'home' })
  const resume = () => go(runRoute(session))

  return (
    <main className="page">
      <p className="eyebrow">Sensitivity Finder</p>
      <h1>{view.heading}</h1>
      <progress className="session-progress" max={view.progress.total} value={view.progress.done} aria-label="Session progress">
        {view.progress.done} of {view.progress.total}
      </progress>
      <p className="hint">
        {view.progress.done} of {view.progress.total} Runs done{step === 'rest' && ` · rested ${rested} s`}
      </p>
      {last && (
        <p className="lede">
          Last Run: {getScenario(last.scenario).name}, Score {formatScore(last.scenario, last.score)}.
        </p>
      )}
      {view.lines.map((line) => (
        <p className="lede" key={line}>
          {line}
        </p>
      ))}
      {saveError !== null && (
        <p className="warning" role="alert">
          The last Run could not be saved ({saveError}). Export your data from Past Runs once the Session is over and free some space.
        </p>
      )}

      <div className="actions">
        {step === 'rest' && (
          <>
            <button type="button" className="primary" ref={primary} disabled={waiting} onClick={resume}>
              {waiting ? `Start next Run (${MIN_REST_SECONDS - rested})` : 'Start next Run'}
            </button>
            <button type="button" onClick={home}>
              Quit Session
            </button>
          </>
        )}
        {step === 'abandoned' && (
          <>
            <button type="button" className="primary" ref={primary} onClick={resume}>
              Resume Session
            </button>
            <button type="button" onClick={home}>
              Quit Session
            </button>
          </>
        )}
        {(step === 'notRaw' || step === 'complete') && (
          <button type="button" className="primary" ref={primary} onClick={home}>
            Back to Home
          </button>
        )}
      </div>
    </main>
  )
}
