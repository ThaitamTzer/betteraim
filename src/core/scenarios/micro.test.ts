import { describe, expect, it } from 'vitest'
import { angleBetween } from '../aim'
import { createRun } from '../run'
import { aimBot, missBot, runBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testParams } from '../testing/params'
import type { RunParams, TargetEvent } from '../types'
import { getScenario, scenarios } from './index'

const micro = (overrides: Partial<RunParams> = {}) => testParams({ scenario: 'micro', ...overrides })
const spawns = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'spawn')
const hits = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'shot' && e.id !== null).length

describe('Micro targets', () => {
  it('are registered next to Flick, with a label and description for the picker', () => {
    expect(scenarios.map((s) => s.id)).toEqual(expect.arrayContaining(['flick', 'micro']))
    for (const s of scenarios) {
      expect(s.name.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
    }
    expect(getScenario('micro').category).toBe('clicking')
  })

  it('spawn 2 to 10 degrees from the crosshair and are clearly smaller than Flick targets', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [target] = createRun(micro({ seed })).state().targets
      const [flick] = createRun(testParams({ seed })).state().targets
      if (!target || !flick) throw new Error('no target at the start of the Run')
      const angle = angleBetween({ yaw: 0, pitch: 0 }, target)
      expect(angle).toBeGreaterThanOrEqual(2 - 1e-9)
      expect(angle).toBeLessThanOrEqual(10 + 1e-9)
      expect(target.radius).toBeLessThanOrEqual(flick.radius / 2)
    }
  })

  it('keep spawning 2 to 10 degrees from where the crosshair is when the last one was hit', () => {
    const { targetEvents } = runBot(micro(), aimBot())
    expect(spawns(targetEvents).length).toBeGreaterThan(50)
    for (const e of spawns(targetEvents)) {
      expect(angleBetween(e.crosshair, e)).toBeGreaterThanOrEqual(2 - 1e-9)
      expect(angleBetween(e.crosshair, e)).toBeLessThanOrEqual(10 + 1e-9)
    }
  })

  it('have the same sizes and distances in degrees whatever the FOV and Sensitivity', () => {
    const a = runBot(micro({ seed: 42 }), aimBot())
    const b = runBot(
      micro({ seed: 42, sensitivity: 40, dpi: 1600, fov: { degrees: 90, axis: 'vertical' } }),
      aimBot({ gain: 1.3, moveMs: 200 }),
    )
    const [sa, sb] = [spawns(a.targetEvents), spawns(b.targetEvents)]
    const n = Math.min(sa.length, sb.length)
    expect(n).toBeGreaterThan(10)
    expect(sb.slice(0, n).map((e) => e.radius)).toEqual(sa.slice(0, n).map((e) => e.radius))
    expect(sb.slice(0, n).map((e) => angleBetween(e.crosshair, e))).toEqual(
      sa.slice(0, n).map((e) => expect.closeTo(angleBetween(e.crosshair, e), 6)),
    )
  })
})

describe('Micro Score = hits x accuracy', () => {
  it('is 22.5 for 30 hits out of 40 shots', () => {
    const perfect = aimBot()
    const wasteful = missBot(aimBot(), 1)
    // Waste one shot at each of the first 10 targets, then stop playing after the 30th hit.
    const bot: Bot = (state) => {
      const id = state.targets[0]?.id ?? 0
      if (id >= 30) return
      return id < 10 ? wasteful(state) : perfect(state)
    }
    const result = runBot(micro(), bot)
    const fired = result.input.filter((e) => e.kind === 'down' && e.button === 0).length
    expect(hits(result.targetEvents)).toBe(30)
    expect(fired).toBe(40)
    expect(result.score).toBe(22.5)
  })

  it('is the number of hits for a perfect bot and 0 when nothing was fired', () => {
    const perfect = runBot(micro(), aimBot())
    expect(perfect.score).toBe(hits(perfect.targetEvents))
    expect(runBot(micro(), () => undefined).score).toBe(0)
  })
})
