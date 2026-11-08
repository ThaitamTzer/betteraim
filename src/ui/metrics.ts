import { leadOf } from '../core'
import type { ClickingMetrics, Metrics, ScenarioId, TrackingMetrics } from '../core'
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

const tracking = (key: string, label: string, unit: string, pick: (m: TrackingMetrics) => number | null, format: (n: number) => string): Metric => ({
  key,
  label,
  unit,
  pick: (m) => (m.category === 'tracking' ? pick(m) : null),
  format,
})

const percent = (n: number) => `${n.toFixed(0)}%`
const speed = (n: number) => `${Math.round(n)}°/s`

/** Ahead/Behind as a magnitude and a word, read through the same dead zone as a Run: 0.40° Behind, Level. Never a minus sign. */
const aheadBehind = (offset: number) => {
  const lead = leadOf(offset)
  return lead === 'level' ? 'Level' : `${Math.abs(offset).toFixed(2)}° ${lead === 'ahead' ? 'Ahead' : 'Behind'}`
}

/**
 * The Analysis metrics the screens show, rates as percentages. A metric's `pick` is null for a Scenario it does not measure;
 * screens show a metric only when some Scenario has a value for it. Mouse speed is both categories' own measure (aim
 * movements for Clicking, tracking time for Tracking), in the same unit.
 */
export const metrics: readonly Metric[] = [
  clicking('accuracy', 'Accuracy', '%', (m) => (m.shots === 0 ? null : m.accuracy * 100), percent),
  clicking('overshootRate', 'Overshoot rate', '%', (m) => (m.movementCount === 0 ? null : m.overshootRate * 100), percent),
  clicking('undershootRate', 'Undershoot rate', '%', (m) => (m.movementCount === 0 ? null : m.undershootRate * 100), percent),
  clicking('pathDeviation', 'Path Deviation', '°', (m) => (m.movementCount === 0 ? null : m.pathDeviation), (n) => `${n.toFixed(2)}°`),
  clicking('smoothness', 'Smoothness', 'velocity peaks per movement', (m) => (m.movementCount === 0 ? null : m.smoothness), (n) => n.toFixed(1)),
  tracking('timeOnTarget', 'Time on Target', '% of the Run', (m) => m.timeOnTargetShare * 100, percent),
  tracking('aheadBehind', 'Ahead / Behind', '°, above 0 is Ahead, below 0 is Behind', (m) => (m.samples === 0 ? null : m.meanOffset), aheadBehind),
  {
    key: 'mouseSpeed',
    label: 'Mouse speed',
    unit: '°/s',
    pick: (m) => (m.category === 'clicking' ? (m.movementCount === 0 ? null : m.mouseSpeed) : m.samples === 0 ? null : m.mouseSpeed),
    format: speed,
  },
]
