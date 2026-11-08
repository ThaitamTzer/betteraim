import { degreesPerCount, wrapDeg } from './aim'
import type { ScenarioDefinition } from './scenario'
import { getScenario } from './scenarios'
import type { Aim, InputEvent, RecordedInput, RunParams, RunResult, RunState } from './types'

export const RUN_DURATION_MS = 30_000
/** Simulated time advances in whole steps of this size, so results do not depend on the tick rate. */
export const STEP_MS = 1

const MAX_PITCH = 89
const FIRE_BUTTON = 0

export interface Run {
  /**
   * Feed one event. Events must be in time order: an earlier `t` is clamped to the current time and
   * recorded that way. The first event at or after RUN_DURATION_MS only ends the Run and is dropped,
   * as is anything pushed after that.
   */
  push(event: InputEvent): void
  state(): RunState
  /** The input, target event log and Score. Throws unless the Run is done. */
  result(): RunResult
}

/** Starts a Run. `definition` overrides the registry lookup (for tests that define their own Scenario). */
export function createRun(params: RunParams, definition: ScenarioDefinition = getScenario(params.scenario)): Run {
  const rules = definition.rules(params.seed)
  const perCount = degreesPerCount(params.sensitivity, params.dpi)
  const input: RecordedInput[] = []
  let aim: Aim = { yaw: 0, pitch: 0 }
  let t = 0
  let stepped = 0
  let held = false
  let done = false

  const advanceTo = (to: number) => {
    while (stepped + STEP_MS <= to) {
      stepped += STEP_MS
      rules.step?.(stepped, aim, held)
    }
    t = to
  }

  return {
    push(event) {
      if (done || !Number.isFinite(event.t)) return
      const at = Math.max(event.t, t)
      if (at >= RUN_DURATION_MS) {
        advanceTo(RUN_DURATION_MS)
        done = true
        return
      }
      advanceTo(at)
      switch (event.kind) {
        case 'move':
          aim = {
            yaw: wrapDeg(aim.yaw + event.dx * perCount),
            pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, aim.pitch - event.dy * perCount)),
          }
          input.push({ kind: 'move', t: at, dx: event.dx, dy: event.dy })
          break
        case 'down':
        case 'up': {
          input.push({ kind: event.kind, t: at, button: event.button })
          if (event.button !== FIRE_BUTTON) break
          const pressed = event.kind === 'down'
          if (pressed && !held) rules.shoot?.(at, aim)
          held = pressed
          break
        }
        case 'tick':
          break
      }
    },
    state: () => ({ t, done, crosshair: aim, targets: rules.targets, score: rules.score }),
    result() {
      if (!done) throw new Error('Run is not done')
      return { input: [...input], targetEvents: [...rules.events], score: rules.score }
    },
  }
}

/** Re-runs recorded input and returns what the core produces for it. Ends the Run with a final tick. */
export function replay(params: RunParams, input: readonly RecordedInput[], definition?: ScenarioDefinition): RunResult {
  const run = createRun(params, definition)
  for (const event of input) run.push(event)
  run.push({ kind: 'tick', t: RUN_DURATION_MS })
  return run.result()
}
