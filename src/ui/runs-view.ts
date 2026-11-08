import type { RunSummary } from '../core'

/**
 * What Past Runs and the Session summary print as a Run's Sensitivity. A Finder Run's stays hidden after its Session too (blinding between
 * Sessions: the Finder result's curve is the one place that reveals the Sensitivities it tested); a Practice Run's is the player's own.
 */
export const sensitivityText = (run: Pick<RunSummary, 'mode' | 'sensitivity'>): string => (run.mode === 'finder' ? 'hidden (Finder)' : `${run.sensitivity} cm/360`)
