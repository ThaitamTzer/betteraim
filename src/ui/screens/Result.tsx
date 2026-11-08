import { tallyShots } from '../../core'
import type { ScreenProps } from '../routes'

export function Result({ route, go }: ScreenProps<'result'>) {
  const { record, again } = route
  const { hits, shots, accuracy } = tallyShots(record.targetEvents)
  return (
    <main className="page">
      <p className="eyebrow">Run complete</p>
      <h1>
        <span className="score" aria-label="Score">
          {record.score.toFixed(1)}
        </span>
      </h1>
      <p className="lede">Score is hits times accuracy, so missed shots cost you.</p>
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
