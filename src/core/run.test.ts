import { describe, expect, it } from 'vitest'
import { angleBetween } from './aim'
import { createRun, replay, RUN_DURATION_MS } from './run'
import type { ScenarioDefinition } from './scenario'
import { aimBot, runBot } from './testing/bots'
import { testParams } from './testing/params'
import type { InputEvent, Target, TargetEvent } from './types'

describe('applying Sensitivity', () => {
  // 25.4 cm/360 at 800 DPI is 8000 counts per 360 degrees, so one count is 0.045 degrees.
  it('turns the view 0.045 degrees per count at 25.4 cm/360 and 800 DPI', () => {
    const run = createRun(testParams())
    run.push({ kind: 'move', t: 1, dx: 1000, dy: 0 })
    expect(run.state().crosshair.yaw).toBeCloseTo(45, 9)
  })

  it('applies the same degrees per count vertically (1:1); moving the mouse up looks up', () => {
    const run = createRun(testParams())
    run.push({ kind: 'move', t: 1, dx: 0, dy: -1000 })
    expect(run.state().crosshair.pitch).toBeCloseTo(45, 9)
  })

  it('wraps yaw around a full turn and clamps pitch below straight up', () => {
    const run = createRun(testParams())
    run.push({ kind: 'move', t: 1, dx: 8000 + 1000, dy: -100000 })
    const { yaw, pitch } = run.state().crosshair
    expect(yaw).toBeCloseTo(45, 9)
    expect(pitch).toBe(89)
  })

  it('a higher cm/360 turns less per count', () => {
    const run = createRun(testParams({ sensitivity: 50.8 }))
    run.push({ kind: 'move', t: 1, dx: 1000, dy: 0 })
    expect(run.state().crosshair.yaw).toBeCloseTo(22.5, 9)
  })
})

describe('a Run lasts 30 s', () => {
  it('ends on the first event at or after 30 s, which is dropped', () => {
    const run = createRun(testParams())
    run.push({ kind: 'move', t: 29_999, dx: 10, dy: 0 })
    expect(run.state().done).toBe(false)
    run.push({ kind: 'down', t: 30_000, button: 0 })
    expect(run.state().done).toBe(true)
    const result = run.result()
    expect(result.input).toEqual([{ kind: 'move', t: 29_999, dx: 10, dy: 0 }])
    expect(result.targetEvents.some((e) => e.kind === 'shot')).toBe(false)
  })

  it('ignores everything pushed after the end', () => {
    const run = createRun(testParams())
    run.push({ kind: 'tick', t: RUN_DURATION_MS })
    run.push({ kind: 'move', t: 30_001, dx: 500, dy: 0 })
    expect(run.state().crosshair.yaw).toBe(0)
    expect(run.result().input).toEqual([])
  })

  it('has no result before it is done', () => {
    expect(() => createRun(testParams()).result()).toThrow()
  })

  it('clamps an event that arrives with an earlier time to the current time, and records it that way', () => {
    const run = createRun(testParams())
    run.push({ kind: 'move', t: 100, dx: 1, dy: 0 })
    run.push({ kind: 'move', t: 50, dx: 1, dy: 0 })
    run.push({ kind: 'tick', t: RUN_DURATION_MS })
    expect(run.result().input).toEqual([
      { kind: 'move', t: 100, dx: 1, dy: 0 },
      { kind: 'move', t: 100, dx: 1, dy: 0 },
    ])
  })
})

describe('replaying a Run', () => {
  it('reproduces the target events and Score from the recorded input alone', () => {
    const params = testParams({ seed: 7 })
    const played = runBot(params, aimBot({ gain: 1.2 }), { tickMs: 3 })
    const again = replay(params, played.input)
    expect(again.targetEvents).toEqual(played.targetEvents)
    expect(again.score).toBe(played.score)
    expect(again.input).toEqual(played.input)
  })
})

// A Tracking Scenario written only against the seam: one target sweeping across the view at 0.02 deg/ms
// from yaw -30 to +30 over 3 s; the Score is the ms it is on target while the fire button is held.
const sweep: ScenarioDefinition = {
  id: 'strafe',
  category: 'tracking',
  rules() {
    let onTargetMs = 0
    let target: Target = { id: 0, yaw: -30, pitch: 0, radius: 2.55 }
    const events: TargetEvent[] = [
      { kind: 'spawn', t: 0, id: 0, yaw: -30, pitch: 0, radius: 2.55, crosshair: { yaw: 0, pitch: 0 } },
    ]
    return {
      get targets() {
        return [target]
      },
      events,
      get score() {
        return onTargetMs
      },
      step(t, aim, held) {
        target = { ...target, yaw: -30 + 0.02 * Math.min(t, 3000) }
        if (held && angleBetween(aim, target) <= target.radius) onTargetMs++
      },
    }
  },
}

describe('a Tracking Scenario on the seam', () => {
  const play = (events: InputEvent[], tickMs?: number) => {
    const run = createRun(testParams({ scenario: 'strafe' }), sweep)
    const all = tickMs
      ? [...events, ...Array.from({ length: Math.floor(RUN_DURATION_MS / tickMs) }, (_, i): InputEvent => ({ kind: 'tick', t: i * tickMs }))]
      : events
    all.sort((a, b) => a.t - b.t)
    for (const e of all) run.push(e)
    run.push({ kind: 'tick', t: RUN_DURATION_MS })
    return run.result().score
  }

  it('is stepped once per ms with the current crosshair and the held fire button', () => {
    // The target is within 2.55 degrees of yaw 0 for t = 1373..1627 ms: 255 steps.
    expect(play([{ kind: 'down', t: 0, button: 0 }])).toBe(255)
    // Releasing at 1500 ms still counts the step at 1500 (events apply after the steps up to their time).
    expect(play([{ kind: 'down', t: 0, button: 0 }, { kind: 'up', t: 1500, button: 0 }])).toBe(128)
    expect(play([])).toBe(0)
  })

  it('gives the same Score whatever the tick rate', () => {
    const input: InputEvent[] = [
      { kind: 'down', t: 10.5, button: 0 },
      { kind: 'move', t: 700.25, dx: -300, dy: 0 }, // 13.5 degrees left: the target is now ahead of the crosshair
      { kind: 'move', t: 1800.75, dx: 300, dy: 0 },
    ]
    const withoutTicks = play(input)
    expect(withoutTicks).toBeGreaterThan(0)
    expect(play(input, 1)).toBe(withoutTicks)
    expect(play(input, 7)).toBe(withoutTicks)
    expect(play(input, 16.7)).toBe(withoutTicks)
  })
})
