import { getScenario } from '../scenarios'
import { analyseClicking } from './clicking'
import { analyseTracking } from './tracking'
import type { RunAnalysis, RunData } from './types'

export { leadOf } from './tracking'
export type * from './types'

/**
 * Analyses one finished Run from its params, input and target events (a `RunRecord` fits). Pure and deterministic:
 * the crosshair path is rebuilt by replaying the input, nothing else was recorded.
 */
export function analyseRun(run: RunData): RunAnalysis {
  switch (getScenario(run.scenario).category) {
    case 'clicking':
      return analyseClicking(run)
    case 'tracking':
      return analyseTracking(run)
  }
}
