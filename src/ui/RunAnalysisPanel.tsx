import { useMemo } from 'react'
import { analyseRun } from '../core'
import type { ClickingAnalysis, RunData } from '../core'
import './run-analysis.css'

const percent = (share: number) => `${(share * 100).toFixed(0)}%`

// One row per metric: what it is called, its value, and what it means in plain words.
const metrics = (a: ClickingAnalysis): { label: string; value: string; note: string }[] => [
  { label: 'Accuracy', value: percent(a.accuracy), note: 'The share of your shots that hit. Every miss lowers your Score.' },
  {
    label: 'Mouse speed',
    value: `${Math.round(a.mouseSpeed)}°/s`,
    note: 'How fast your crosshair moved between a target appearing and you hitting it. It counts turning, not centimetres, so it is comparable between Sensitivities.',
  },
  {
    label: 'Overshoot rate',
    value: percent(a.overshootRate),
    note: "How often your first swing flew past the far edge of the target, so you had to come back.",
  },
  {
    label: 'Undershoot rate',
    value: percent(a.undershootRate),
    note: "How often your first swing stopped short of the near edge of the target, so you had to add more.",
  },
  {
    label: 'Path Deviation',
    value: `${a.pathDeviation.toFixed(2)}°`,
    note: 'How far, on average, your crosshair strayed sideways from the straight line to the target. Lower is straighter.',
  },
  {
    label: 'Smoothness',
    value: a.smoothness.toFixed(1),
    note: 'How many bursts of speed each movement took. 1.0 is one clean swing; every correction adds one. Fewer is smoother.',
  },
]

/** The Run Analysis of a finished Clicking Run, for the result screen. Shows nothing for other Scenario categories. */
export function RunAnalysisPanel({ record }: { record: RunData }) {
  const analysis = useMemo(() => analyseRun(record), [record])
  if (analysis.category !== 'clicking') return null
  if (analysis.movementCount === 0) {
    return (
      <section className="analysis" aria-labelledby="analysis-title">
        <h2 id="analysis-title">Run Analysis</h2>
        <p className="lede">No target was hit, so there is no aim movement to analyse.</p>
      </section>
    )
  }
  return (
    <section className="analysis" aria-labelledby="analysis-title">
      <h2 id="analysis-title">Run Analysis</h2>
      <dl>
        {metrics(analysis).map(({ label, value, note }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="value">{value}</dd>
            <dd className="note">{note}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">Based on {analysis.movementCount} aim movements, each from a target appearing to the hit that killed it.</p>
    </section>
  )
}
