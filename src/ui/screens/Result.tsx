import { useEffect, useState } from 'react'
import { tallyShots } from '../../core'
import { saveOutcome } from '../../storage/runs'
import { RunAnalysisPanel } from '../RunAnalysisPanel'
import type { ScreenProps } from '../routes'
import { formatScore, trackingRule } from '../score'

export function Result({ route, go }: ScreenProps<'result'>) {
  const { record, again } = route
  const { hits, shots, accuracy } = tallyShots(record.targetEvents)
  const rule = trackingRule[record.scenario]
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => {
    saveOutcome(record.id)?.catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
  }, [record.id])
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
        <button type="button" onClick={() => go({ name: 'home' })}>
          Change setup
        </button>
      </div>
    </main>
  )
}
