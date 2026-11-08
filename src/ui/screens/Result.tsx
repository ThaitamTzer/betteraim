import { useEffect, useState } from 'react'
import { tallyShots } from '../../core'
import { errorMessage } from '../../error-message'
import { saveOutcome } from '../../storage/runs'
import { RunAnalysisPanel } from '../RunAnalysisPanel'
import type { ScreenProps } from '../routes'
import { formatScore, trackingRule } from '../score'

export function Result({ route, go }: ScreenProps<'result'>) {
  const { record, again, more } = route
  const { sessionId } = record
  const { hits, shots, accuracy } = tallyShots(record.targetEvents)
  const rule = trackingRule[record.scenario]
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => {
    saveOutcome(record.id)?.catch((error: unknown) => setSaveError(errorMessage(error)))
  }, [record.id])
  // Saving runs in the background: wait for this Run to be stored so the summary includes it (a failed save is shown above).
  const showSession = async (sessionId: string) => {
    await saveOutcome(record.id)?.catch(() => undefined)
    go({ name: 'session', sessionId, back: route })
  }
  return (
    <main className="page">
      <p className="eyebrow">Run complete</p>
      <h1>
        <span className="score" aria-label="Score">
          {formatScore(record.scenario, record.score)}
        </span>
      </h1>
      <p className="lede">{rule ?? 'Score is hits times accuracy, so missed shots cost you.'}</p>
      {!rule && (
        <dl className="stats">
          <div>
            <dt>Hits</dt>
            <dd>{hits}</dd>
          </div>
          <div>
            <dt>Shots</dt>
            <dd>{shots}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{(accuracy * 100).toFixed(0)}%</dd>
          </div>
        </dl>
      )}
      {saveError !== null && (
        <p className="warning" role="alert">
          This Run could not be saved ({saveError}). Export your data from Past Runs and free some space.
        </p>
      )}
      <RunAnalysisPanel record={record} />

      <div className="actions">
        <button type="button" className="primary" onClick={() => go(again)} autoFocus>
          Play again
        </button>
        {more && (
          <button type="button" onClick={() => go(more)}>
            Pick another Scenario
          </button>
        )}
        {sessionId !== undefined && (
          <button type="button" onClick={() => void showSession(sessionId)}>
            Session summary
          </button>
        )}
        <button type="button" onClick={() => go({ name: 'home' })}>
          Change setup
        </button>
      </div>
    </main>
  )
}
