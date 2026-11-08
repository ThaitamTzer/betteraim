import type { ScenarioId } from '../core'

/** A Score as the player reads it: Strafe is a percentage, Switch a count, Clicking Scenarios hits x accuracy. */
export const formatScore = (scenario: ScenarioId, score: number): string =>
  scenario === 'strafe' ? `${score.toFixed(1)}%` : scenario === 'switch' ? score.toFixed(0) : score.toFixed(1)

/** One line on how a Tracking Scenario is scored, for the start and result screens. */
export const trackingRule: Partial<Record<ScenarioId, string>> = {
  strafe: 'Hold the left mouse button and keep the crosshair on the target. Score is the share of the Run you did.',
  switch:
    'Hold the left mouse button with the crosshair on a target; it falls after 0.4 s in total. Score is the number of targets eliminated.',
}
