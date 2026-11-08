import type { AnalysedRun, RunMode, RunSummary } from '../core'

/**
 * What Past Runs and the Session summary print as a Run's Sensitivity. A Finder Run's stays hidden after its Session too (blinding between
 * Sessions: the Finder result's curve is the one place that reveals the Sensitivities it tested); a Practice Run's is the player's own.
 */
export const sensitivityText = (run: Pick<RunSummary, 'mode' | 'sensitivity'>): string => (run.mode === 'finder' ? 'hidden (Finder)' : `${run.sensitivity} cm/360`)

/**
 * The Runs History charts: one mode (Finder Runs are played at hidden, varied Sensitivities and would pollute Practice trends) and, when the
 * player has a setup, their Game Profile (Scores of different games are not comparable).
 */
export const historyRuns = (items: readonly AnalysedRun[], mode: RunMode, gameProfileId: string | undefined): AnalysedRun[] =>
  items.filter(({ run }) => run.mode === mode && (gameProfileId === undefined || run.gameProfileId === gameProfileId))
