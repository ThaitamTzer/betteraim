import { getScenario } from '../scenarios'
import type { RunSummary } from '../storage'
import type { ScenarioCategory } from '../types'
import { fitFinder } from './model'
import type { FinderFit, FitOptions } from './model'

/**
 * The Performance Curve of each Scenario category on its own (spec: "per-category curves"). Each is `fitFinder` on only that category's Runs, so
 * the Clicking/Tracking weights have nothing to weigh (they are 1) and the options still apply (`exclude`: Reset Finder). A category with too
 * little data has `peak: null` and `reason: 'insufficient-data'`, as any fit does.
 */
export function fitCategories(runs: readonly RunSummary[], options: FitOptions): Record<ScenarioCategory, FinderFit> {
  const of = (category: ScenarioCategory): FinderFit => fitFinder(runs.filter((r) => getScenario(r.scenario).category === category), options)
  return { clicking: of('clicking'), tracking: of('tracking') }
}
