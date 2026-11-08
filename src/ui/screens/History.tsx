import { useState } from 'react'
import { byDay, getGameProfile, getScenario, scenarios } from '../../core'
import type { AnalysedRun, RunMode, ScenarioId } from '../../core'
import { Chart } from '../Chart'
import { Select } from '../fields'
import { localDay } from '../format'
import { metrics } from '../metrics'
import type { ScreenProps } from '../routes'
import { historyRuns } from '../runs-view'
import { loadSettings } from '../settings'
import { useAnalysed } from '../useAnalysed'
import '../summary.css'

// Which metrics share a chart: the two rates are on one scale and read best together.
const chartGroups = [['accuracy'], ['overshootRate', 'undershootRate'], ['pathDeviation'], ['smoothness'], ['timeOnTarget'], ['aheadBehind']]

const MODES = [
  ['practice', 'Practice'],
  ['finder', 'Finder'],
] as const

export function History({ go }: ScreenProps<'history'>) {
  const loaded = useAnalysed()
  const [mode, setMode] = useState<RunMode>('practice')
  if (!loaded) return <main className="page wide"><p className="lede">Analysing your Runs. This can take a few seconds the first time.</p></main>
  if ('error' in loaded) {
    return (
      <main className="page wide">
        <p className="warning" role="alert">Your Runs could not be read: {loaded.error}</p>
      </main>
    )
  }
  if (loaded.items.every((i) => i.run.warmup)) {
    return (
      <main className="page wide">
        <p className="eyebrow">History</p>
        <h1>Nothing to chart yet</h1>
        <p className="lede">
          Play a Run and it will show up here by day. Warm-up Runs are not counted.{' '}
          <button type="button" className="link" onClick={() => go({ name: 'home' })}>Play one</button>
        </p>
      </main>
    )
  }
  const gameProfileId = loadSettings()?.gameProfileId
  const items = historyRuns(loaded.items, mode, gameProfileId)
  const played = items.filter((i) => !i.run.warmup)
  const game = gameProfileId === undefined ? 'any game' : getGameProfile(gameProfileId).name
  return (
    <main className="page wide">
      <p className="eyebrow">History</p>
      <h1>Your progress by day</h1>
      <p className="lede">
        Each point pools all the Runs of one day, for {game}. Warm-up Runs are not counted, and a day without a value (no shots, no hits) is
        skipped.
      </p>
      <div className="setup">
        <Select label="Runs" value={mode} choices={MODES} onChange={setMode} />
      </div>
      {mode === 'finder' && (
        <p className="hint">Finder Runs are played at different Sensitivities, hidden from you, so these charts mix them: they are not a trend of your aim.</p>
      )}
      {played.length === 0 ? (
        <p className="lede">
          No {mode === 'finder' ? 'Finder' : 'Practice'} Runs in {game} yet.{' '}
          <button type="button" className="link" onClick={() => go({ name: mode === 'finder' ? 'finder' : 'home' })}>Play one</button>
        </p>
      ) : (
        <Charts key={mode} items={items} latest={played.at(-1)!.run.scenario} />
      )}
    </main>
  )
}

function Charts({ items, latest }: { items: AnalysedRun[]; latest: ScenarioId }) {
  const [picked, setPicked] = useState<ScenarioId>(latest)
  const days = byDay(items, localDay)
  // One point per day the Scenario was played, pooled over that day's Runs; x is the point's number so idle days leave no gap.
  const points = days.flatMap((d) => {
    const aggregate = d.aggregate.scenarios.find((s) => s.scenario === picked)
    const label = new Date(d.runs[0]!.run.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return aggregate ? [{ label, aggregate }] : []
  })
  const x = points.map((_, i) => i)
  const formatX = (v: number) => (Number.isInteger(v) ? (points[v]?.label ?? '') : '')
  const name = getScenario(picked).name
  const unitOfScore = picked === 'strafe' ? ' (% of the Run on target)' : picked === 'switch' ? ' (targets eliminated)' : ''
  const charts = chartGroups
    .map((keys) => metrics.filter((m) => keys.includes(m.key)))
    .map((group) => ({ group, series: group.map((m) => ({ label: m.label, values: points.map((p) => m.pick(p.aggregate.metrics)) })) }))
    .filter(({ series }) => series.some((s) => s.values.some((v) => v !== null)))

  return (
    <>
      <div className="setup">
        <Select
          label="Scenario"
          value={picked}
          choices={scenarios.filter((s) => items.some((i) => !i.run.warmup && i.run.scenario === s.id)).map((s) => [s.id, s.name] as const)}
          onChange={setPicked}
        />
      </div>
      {points.length === 1 && <p className="hint">Only one day so far. Play {name} on another day to see a trend.</p>}

      <section className="chart-block">
        <h2>Score{unitOfScore}</h2>
        <Chart
          x={x}
          series={[{ label: 'Mean Score', values: points.map((p) => p.aggregate.score.mean) }, { label: 'Best Score', values: points.map((p) => p.aggregate.score.best) }]}
          formatX={formatX}
          xLabel="Day"
          description={`${name} Score per day, mean and best`}
        />
      </section>
      {charts.map(({ group, series }) => (
        <section className="chart-block" key={group.map((m) => m.key).join()}>
          <h2>
            {group.map((m) => m.label).join(' and ')} ({group[0]!.unit})
          </h2>
          <Chart x={x} series={series} formatX={formatX} xLabel="Day" description={`${name} ${group.map((m) => m.label).join(' and ')} per day`} />
        </section>
      ))}
    </>
  )
}
