import { aggregateRuns, getScenario } from '../../core'
import { formatMeanScore, metrics } from '../metrics'
import { PracticeAdvice } from '../PracticeAdvice'
import type { ScreenProps } from '../routes'
import { formatScore } from '../score'
import { useAnalysed } from '../useAnalysed'
import '../summary.css'

/**
 * Compares the Scenarios of one Session (Finder or Practice) on Score and Analysis metrics. It only needs a Session id and
 * loads everything from the RunStore, so any screen can open it.
 */
export function SessionSummary({ route, go }: ScreenProps<'session'>) {
  const loaded = useAnalysed(route.sessionId)
  const backButton = (
    <button type="button" onClick={() => go(route.back)}>
      Back
    </button>
  )
  const back = <div className="actions">{backButton}</div>

  if (!loaded) return <main className="page wide"><p className="lede">Loading your Session...</p></main>
  if ('error' in loaded) {
    return (
      <main className="page wide">
        <p className="warning" role="alert">Your Runs could not be read: {loaded.error}</p>
        {back}
      </main>
    )
  }
  const { items } = loaded
  if (items.length === 0) {
    return (
      <main className="page wide">
        <p className="eyebrow">Session summary</p>
        <h1>No Runs found</h1>
        <p className="lede">This Session has no saved Runs.</p>
        {back}
      </main>
    )
  }

  const { scenarios, warmups } = aggregateRuns(items)
  // Only the metrics that at least one Scenario measured get a column (Tracking metrics appear once #8 produces them).
  const columns = metrics.filter((m) => scenarios.some((s) => m.pick(s.metrics) !== null))
  const counted = scenarios.reduce((n, s) => n + s.runs, 0)
  const first = items[0]!.run

  return (
    <main className="page wide">
      <p className="eyebrow">Session summary</p>
      <h1>{new Date(first.startedAt).toLocaleString()}</h1>
      <p className="lede">
        {counted} {counted === 1 ? 'Run' : 'Runs'} counted
        {warmups > 0 && `, ${warmups} warm-up ${warmups === 1 ? 'Run' : 'Runs'} left out`}.
      </p>

      {scenarios.length === 0 ? (
        <p className="lede">Only warm-up Runs were played, so there is nothing to compare yet.</p>
      ) : (
        <>
          <h2>Scenarios compared</h2>
          <div className="table-wrap">
            <table className="results">
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Mean Score</th>
                  <th scope="col">Best Score</th>
                  {columns.map((m) => (
                    <th key={m.key} scope="col">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.scenario}>
                    <th scope="row">{getScenario(s.scenario).name}</th>
                    <td>{s.runs}</td>
                    <td>{formatMeanScore(s.scenario, s.score.mean)}</td>
                    <td>{formatScore(s.scenario, s.score.best)}</td>
                    {columns.map((m) => {
                      const value = m.pick(s.metrics)
                      return <td key={m.key}>{value === null ? '–' : m.format(value)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Metrics pool every shot and Aim Movement of a Scenario's Runs, so a Run with more of them counts for more. Scores
            of different Scenarios are in different units and are not comparable.
          </p>
        </>
      )}

      <h2>Runs</h2>
      <div className="table-wrap">
        <table className="runs">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Scenario</th>
              <th scope="col">Score</th>
              <th scope="col">Sensitivity</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {items.map(({ run }) => (
              <tr key={run.id}>
                <td>{new Date(run.startedAt).toLocaleTimeString()}</td>
                <td>{getScenario(run.scenario).name}</td>
                <td>{formatScore(run.scenario, run.score)}</td>
                <td>{run.sensitivity} cm/360</td>
                <td>{run.warmup && <span className="tag">Warm-up, not counted</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Advice is for Practice Sessions; a Finder Session's Analysis goes to the Finder result (ticket #15). */}
      {scenarios.length > 0 && items.some((i) => i.run.mode === 'practice' && !i.run.warmup) ? (
        <PracticeAdvice items={items} onSetup={() => go({ name: 'options' })}>
          {backButton}
        </PracticeAdvice>
      ) : (
        back
      )}
    </main>
  )
}
