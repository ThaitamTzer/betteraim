import { useMemo } from 'react'
import { analyseRun } from '../core'
import type { ClickingAnalysis, RunData, TrackingAnalysis } from '../core'
import './run-analysis.css'

const percent = (share: number) => `${(share * 100).toFixed(0)}%`

interface Row {
  label: string
  value: string
  note: string
}

// One row per metric: what it is called, its value, and what it means in plain words.
const clickingRows = (a: ClickingAnalysis): Row[] => [
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

const leadValue = (a: TrackingAnalysis) =>
  a.lead === 'level' ? 'Level' : `${Math.abs(a.meanOffset).toFixed(2)}° ${a.lead === 'ahead' ? 'Ahead' : 'Behind'}`

const leadNote: Record<TrackingAnalysis['lead'], string> = {
  ahead: 'Your crosshair rode in front of the target, in the direction it was moving: you were leading it. Let the target come to your crosshair, or follow it closer.',
  behind: 'Your crosshair trailed behind the target, against the direction it was moving: you were chasing it. Start moving sooner and keep your hand moving with it.',
  level: 'Your crosshair rode with the target, neither in front of it nor behind it by any amount you could feel.',
}

const trackingRows = (a: TrackingAnalysis): Row[] => [
  {
    label: 'Time on Target',
    value: `${(a.timeOnTargetMs / 1000).toFixed(1)} s · ${percent(a.timeOnTargetShare)}`,
    note: 'How long you held fire with your crosshair on a target, and its share of the 30 s Run. It is what scores: Strafe is that share, a Switch target falls after 0.4 s of it.',
  },
  { label: 'Ahead / Behind', value: leadValue(a), note: leadNote[a.lead] },
  {
    label: 'Mouse speed',
    value: `${Math.round(a.mouseSpeed)}°/s`,
    note: 'How fast your crosshair moved while you were tracking. It counts turning, not centimetres, so it is comparable between Sensitivities.',
  },
]

/** The Run Analysis of a finished Run, for the result screen: aim movements for a Clicking Scenario, tracking for a Tracking one. */
export function RunAnalysisPanel({ record }: { record: RunData }) {
  const analysis = useMemo(() => analyseRun(record), [record])
  const clicking = analysis.category === 'clicking'
  if (clicking ? analysis.movementCount === 0 : analysis.samples === 0) {
    return (
      <section className="analysis" aria-labelledby="analysis-title">
        <h2 id="analysis-title">Run Analysis</h2>
        <p className="lede">
          {clicking
            ? 'No target was hit, so there is no aim movement to analyse.'
            : 'You did not hold fire with your crosshair settled near a target, so there is no tracking to analyse.'}
        </p>
      </section>
    )
  }
  return (
    <section className="analysis" aria-labelledby="analysis-title">
      <h2 id="analysis-title">Run Analysis</h2>
      <dl>
        {(clicking ? clickingRows(analysis) : trackingRows(analysis)).map(({ label, value, note }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="value">{value}</dd>
            <dd className="note">{note}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        {clicking
          ? `Based on ${analysis.movementCount} aim movements, each from a target appearing to the hit that killed it.`
          : `Ahead / Behind and mouse speed are based on ${(analysis.samples / 1000).toFixed(1)} s of tracking: holding fire with your crosshair close to a target and settled on it, not flicking between targets.`}
      </p>
    </section>
  )
}
