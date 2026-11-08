import type { ClickingMetrics, Metrics, ScenarioId } from '../core'
import { formatScore } from './score'

/** A mean Score: like `formatScore`, but a mean count of Switch targets keeps its decimal (7.5 is not 8). */
export const formatMeanScore = (scenario: ScenarioId, score: number): string =>
  scenario === 'switch' ? score.toFixed(1) : formatScore(scenario, score)

/** One column of the Session summary and one line of a History chart. */
export interface Metric {
  key: string
  label: string
  /** What the number counts, for a chart title. */
  unit: string
  /** The value in `m`, or null when `m` is another kind of Scenario's or there was nothing to measure (no shot, no hit). */
  pick(m: Metrics): number | null
  format(n: number): string
}

const clicking = (key: string, label: string, unit: string, pick: (m: ClickingMetrics) => number | null, format: (n: number) => string): Metric => ({
  key,
  label,
  unit,
  pick: (m) => (m.category === 'clicking' ? pick(m) : null),
  format,
})

const percent = (n: number) => `${n.toFixed(0)}%`

/**
 * The Analysis metrics the screens show, rates as percentages. Tracking metrics (time on target, Ahead/Behind; ticket #8) join
 * here as entries that read `TrackingMetrics`; screens show a metric only when some Scenario has a value for it.
 */
export const metrics: readonly Metric[] = [
  clicking('accuracy', 'Accuracy', '%', (m) => (m.shots === 0 ? null : m.accuracy * 100), percent),
  clicking('overshootRate', 'Overshoot rate', '%', (m) => (m.movementCount === 0 ? null : m.overshootRate * 100), percent),
  clicking('undershootRate', 'Undershoot rate', '%', (m) => (m.movementCount === 0 ? null : m.undershootRate * 100), percent),
  clicking('pathDeviation', 'Path Deviation', '°', (m) => (m.movementCount === 0 ? null : m.pathDeviation), (n) => `${n.toFixed(2)}°`),
  clicking('smoothness', 'Smoothness', 'velocity peaks per movement', (m) => (m.movementCount === 0 ? null : m.smoothness), (n) => n.toFixed(1)),
  clicking('mouseSpeed', 'Mouse speed', '°/s', (m) => (m.movementCount === 0 ? null : m.mouseSpeed), (n) => `${Math.round(n)}°/s`),
]
