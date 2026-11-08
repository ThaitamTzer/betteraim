import type { ScenarioDefinition } from '../scenario'
import type { ScenarioId } from '../types'
import { flick } from './flick'
import { micro } from './micro'
import { strafe } from './strafe'
import { switchScenario } from './switch'

/** Every playable Scenario, one line each. Practice's picker lists this array. */
export const scenarios: readonly ScenarioDefinition[] = [
  flick,
  micro,
  strafe,
  switchScenario,
]

export const getScenario = (id: ScenarioId): ScenarioDefinition => {
  const found = scenarios.find((s) => s.id === id)
  if (!found) throw new Error(`Scenario not available: ${id}`)
  return found
}
