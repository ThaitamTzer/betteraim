import { useEffect, useMemo, useState } from 'react'
import { finderRunsFor, fitCategories, fitFinder, getGameProfile, INTERVAL_LEVEL, nextSession, practiceFov } from '../../core'
import type { FinderFit, NextSession, ScenarioCategory } from '../../core'
import { runStore, saveOutcome } from '../../storage/runs'
import { Chart } from '../Chart'
import { CoachPanel } from '../CoachPanel'
import { centreOf } from '../finder'
import { categoriesView, categoryRows, chartRows, nextView, resultView } from '../finder-result'
import { fmt } from '../format'
import { loadPreferences } from '../preferences'
import type { ScreenProps } from '../routes'
import { loadSettings } from '../settings'
import { useCoachChoice } from '../useCoachChoice'
import '../summary.css'
import '../finder-result.css'

const formatX = (x: number): string => fmt(x)
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

type Loaded = { fit: FinderFit; categories: Record<ScenarioCategory, FinderFit>; next: NextSession } | { error: string } | null

/**
 * The Performance Curve of one Game Profile and what it recommends. It is the one screen that shows Sensitivities of Finder
 * Runs (the curve's x axis); it needs only a Game Profile and DPI, so Home can open it without a Session.
 */
export function FinderResult({ route, go }: ScreenProps<'finderResult'>) {
  const { gameProfileId, dpi, sessionId, saving } = route
  const game = getGameProfile(gameProfileId)
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Reset Finder (#11): `reloads` makes the effect read the Runs again once the marker is stored.
  const [reloads, setReloads] = useState(0)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void (async () => {
      // The Session's last Run is still being saved when this opens: wait for it, or the fit would miss it.
      if (saving) await saveOutcome(saving)?.catch((error: unknown) => current && setSaveError(errorText(error)))
      const store = await runStore()
      // The Runs and the Reset marker come from finderRunsFor, the one place the marker is applied.
      const { runs, exclude } = await finderRunsFor(store, gameProfileId)
      const options = { weights: game.weights, exclude }
      const fit = fitFinder(runs, options)
      const settings = loadSettings()
      const own = settings?.gameProfileId === gameProfileId ? settings : { gameProfileId, gameSensitivity: game.defaultSensitivity, dpi }
      return { fit, categories: fitCategories(runs, options), next: nextSession(fit, centreOf(own)) }
    })().then(
      (result) => current && setLoaded(result),
      (error: unknown) => current && setLoaded({ error: errorText(error) }),
    )
    return () => {
      current = false
    }
  }, [gameProfileId, dpi, saving, game, reloads])

  const resetFinder = async () => {
    try {
      await (await runStore()).resetFinder(gameProfileId, Date.now())
      setResetError(null)
      setConfirmingReset(false)
      setReloads((n) => n + 1)
    } catch (error) {
      setResetError(errorText(error))
    }
  }

  // The AI Coach's choice (cached from earlier, or asked for with the button) replaces the Curve Peak as the Recommended Sensitivity.
  const coach = useCoachChoice(loaded && 'fit' in loaded ? loaded.fit : null, gameProfileId)
  const view = useMemo(() => (loaded && 'fit' in loaded ? resultView(loaded.fit, gameProfileId, dpi, coach.choice) : null), [loaded, gameProfileId, dpi, coach.choice])
  const recommended = view?.recommended ?? null
  const coachPick = view?.source === 'coach' ? (recommended?.cm360 ?? null) : null
  // Chart props are rebuilt only when the fit changes: the chart is redrawn on any new prop.
  const chart = useMemo(() => {
    if (!loaded || 'error' in loaded || loaded.fit.curve.sensitivity.length === 0) return null
    const { fit } = loaded
    const rows = chartRows(fit)
    const bounds = fit.interval ? `, interval ${fmt(fit.interval.low)} to ${fmt(fit.interval.high)} cm/360` : ''
    return {
      x: rows.x,
      series: [
        { label: 'Performance Curve', values: rows.curve },
        { label: 'Your Runs', values: rows.points, dots: true },
      ],
      markers: [
        ...(fit.peak === null ? [] : [{ x: fit.peak, label: 'Curve Peak' }]),
        ...(coachPick === null ? [] : [{ x: coachPick, label: 'AI Coach', tone: 'on-target' as const }]),
      ],
      bands: fit.interval ? [{ from: fit.interval.low, to: fit.interval.high }] : [],
      description: `Performance Curve: Score against Sensitivity in cm/360${fit.peak === null ? ', with no interior peak' : `, highest at ${fmt(fit.peak)} cm/360${bounds}`}${coachPick === null ? '' : `; the AI Coach chose ${fmt(coachPick)} cm/360`}`,
    }
  }, [loaded, coachPick])
  // The Clicking and Tracking curves on their own chart (#11); null until some Run has been fitted.
  const byCategory = useMemo(() => {
    if (!loaded || 'error' in loaded || loaded.fit.counts.runs === 0) return null
    const rows = categoryRows(loaded.categories)
    const text = categoriesView(loaded.categories)
    return {
      text,
      chart: rows.x.length === 0 ? null : {
        x: rows.x,
        series: [
          { label: 'Clicking', values: rows.clicking },
          { label: 'Tracking', values: rows.tracking },
        ],
        markers: rows.markers,
        description: `Clicking and Tracking curves: Score against Sensitivity in cm/360. ${text.categories.map((c) => c.message).join(' ')}`,
      },
    }
  }, [loaded])

  const actions = (
    <div className="actions">
      {recommended && (
        <button
          type="button"
          className="primary"
          // Practice is the only place the FOV override applies; the Finder never uses it.
          onClick={() =>
            go({ name: 'practice', sensitivity: recommended.cm360, dpi, fov: practiceFov(gameProfileId, loadPreferences().practiceFov), gameProfileId })
          }
        >
          Use this Sensitivity in Practice
        </button>
      )}
      <button type="button" className={recommended ? undefined : 'primary'} onClick={() => go({ name: 'finder' })}>
        {loaded && 'fit' in loaded && loaded.fit.counts.sessions === 0 ? 'Start a Session' : 'Start another Session'}
      </button>
      {sessionId && (
        <button type="button" onClick={() => go({ name: 'session', sessionId, back: route })}>
          Session summary
        </button>
      )}
      {loaded && 'fit' in loaded && loaded.fit.counts.runs > 0 && !confirmingReset && (
        <button type="button" onClick={() => setConfirmingReset(true)}>
          Reset Finder
        </button>
      )}
      <button type="button" onClick={() => go({ name: 'home' })}>
        Back to Home
      </button>
    </div>
  )

  if (!loaded) return <main className="page wide"><p className="lede">Fitting your Performance Curve...</p></main>
  if ('error' in loaded) {
    return (
      <main className="page wide">
        <p className="warning" role="alert">Your Runs could not be read: {loaded.error}</p>
        {actions}
      </main>
    )
  }
  const { fit } = loaded

  return (
    <main className="page wide">
      <p className="eyebrow">Sensitivity Finder · {game.name}</p>
      <h1>{recommended ? 'Your Recommended Sensitivity' : 'Your Performance Curve'}</h1>
      {saveError !== null && (
        <p className="warning" role="alert">
          The last Run could not be saved ({saveError}), so it is not in this result. Export your data from Past Runs once you can and free some space.
        </p>
      )}
      <p className={view?.enough ? 'result-message enough' : 'result-message'} role="status">
        {view?.message}
      </p>
      <p className="hint">Next Session: {nextView(loaded.next)}</p>

      {recommended && view && (
        <>
          <dl className="stats">
            <div>
              <dt>Sensitivity (cm/360)</dt>
              <dd>{fmt(recommended.cm360)}</dd>
            </div>
            <div>
              <dt>{game.name} Game Sensitivity</dt>
              <dd>{fmt(recommended.gameSensitivity)}</dd>
            </div>
            <div>
              <dt>eDPI at {dpi} DPI</dt>
              <dd>{fmt(recommended.eDpi)}</dd>
            </div>
          </dl>
          <p className="hint">
            Game Sensitivity and eDPI are worked out from the cm/360 at {dpi} DPI.{view.note ? ` ${view.note}` : ''}
          </p>
          {view.source === 'coach' && <p className="hint">Chosen by the AI Coach inside the interval. The Curve Peak is marked on the chart too.</p>}
          {fit.interval && (
            <p className="hint">
              Curve Peak {fmt(fit.peak!)} cm/360, {Math.round(INTERVAL_LEVEL * 100)}% interval {fmt(fit.interval.low)} to {fmt(fit.interval.high)} cm/360.
            </p>
          )}
        </>
      )}

      <CoachPanel fit={fit} coach={coach} onSetup={() => go({ name: 'options' })} />

      {chart && (
        <section className="chart-block">
          <h2>Performance Curve</h2>
          <Chart x={chart.x} series={chart.series} markers={chart.markers} bands={chart.bands} formatX={formatX} xLabel="cm/360" logX description={chart.description} />
          <p className="hint">
            Higher is better: Score relative to the top of the curve, in standard deviations of each Scenario&apos;s Score, against Sensitivity in cm/360.
            The dots are your Runs with day-to-day form and learning taken out
            {fit.interval ? '; the shaded band is the interval of the Curve Peak' : ''}.
          </p>
        </section>
      )}

      {byCategory && (
        <section className="chart-block">
          <h2>Clicking and Tracking</h2>
          {byCategory.chart && (
            <Chart
              x={byCategory.chart.x}
              series={byCategory.chart.series}
              markers={byCategory.chart.markers}
              formatX={formatX}
              xLabel="cm/360"
              logX
              height={180}
              description={byCategory.chart.description}
            />
          )}
          <ul className="category-lines">
            {byCategory.text.categories.map((c) => (
              <li key={c.label}>{c.message}</li>
            ))}
          </ul>
          {byCategory.text.difference && <p className="result-message">{byCategory.text.difference}</p>}
          <p className="hint">
            Each curve is fitted on its own Scenarios only, so the Clicking and Tracking mix of {game.name} does not enter it. The Performance Curve above does weigh them.
          </p>
        </section>
      )}

      {resetError !== null && (
        <p className="warning" role="alert">
          The Finder could not be reset: {resetError}
        </p>
      )}
      {confirmingReset && (
        <div className="warning" role="alertdialog" aria-labelledby="reset-title">
          <p id="reset-title">
            <strong>Reset the Sensitivity Finder for {game.name}?</strong>
          </p>
          <p>
            The curve starts again from nothing: your earlier Finder Runs stop counting towards it and the next Session is coarse. Your raw data is kept. Every
            earlier Run stays in Analysis, History and Past Runs, and in your exports.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void resetFinder()}>
              Reset Finder
            </button>
            <button type="button" onClick={() => setConfirmingReset(false)} autoFocus>
              Keep my curve
            </button>
          </div>
        </div>
      )}
      {actions}
    </main>
  )
}
