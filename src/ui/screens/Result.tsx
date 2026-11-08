import { tallyShots } from '../../core'
import type { ScreenProps } from '../routes'
import { formatScore, trackingRule } from '../score'

export function Result({ route, go }: ScreenProps<'result'>) {
  const { record, again } = route
  const { hits, shots, accuracy } = tallyShots(record.targetEvents)
  const rule = trackingRule[record.scenario]
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
