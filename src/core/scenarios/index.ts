import type { ScenarioDefinition } from '../scenario'
import type { ScenarioId } from '../types'
import { flick } from './flick'

/** Every playable Scenario, one line each. Practice's picker lists this array. */
export const scenarios: readonly ScenarioDefinition[] = [
  flick,
]

export const getScenario = (id: ScenarioId): ScenarioDefinition => {
  const found = scenarios.find((s) => s.id === id)
  if (!found) throw new Error(`Scenario not available: ${id}`)
  return found
}
