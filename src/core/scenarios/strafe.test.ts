import { describe, expect, it } from 'vitest'
import { angleBetween, offsetAim } from '../aim'
import { createRun } from '../run'
import { runBot, trackBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testParams } from '../testing/params'
import type { RunParams, RunRecord, Target } from '../types'
import { getScenario } from './index'

const strafe = (overrides: Partial<RunParams> = {}) => testParams({ scenario: 'strafe', ...overrides })

/** Plays `bot` and keeps the target the Run showed at every tick (1 ms apart). */
const playAndWatch = (params: RunParams, bot: Bot) => {
  const seen: Target[] = []
  const result = runBot(params, (state) => {
    if (state.targets[0]) seen.push(state.targets[0])
    return bot(state)
  })
  return { result, seen }
}

describe('Strafe Score = percentage of time on target', () => {
  it('is registered as a Tracking Scenario with a label and description for the picker', () => {
    const s = getScenario('strafe')
    expect(s.category).toBe('tracking')
    expect(s.name).toBe('Strafe')
    expect(s.description.length).toBeGreaterThan(0)
  })

  it('is close to 100 for a bot that tracks the target perfectly while holding fire', () => {
    for (const seed of [1, 2, 3]) expect(runBot(strafe({ seed }), trackBot()).score).toBeGreaterThan(99)
  })

  it('is 0 for an idle bot', () => {
    expect(runBot(strafe(), () => undefined).score).toBe(0)
  })

  it('counts time only while fire is held: a perfect tracker that never fires scores 0', () => {
    const silent: Bot = (state) => ({ ...trackBot()(state), fire: false })
    expect(runBot(strafe(), silent).score).toBe(0)
  })

  it('counts time only while the crosshair is on the target: holding fire without aiming scores low', () => {
    for (const seed of [1, 2, 3]) expect(runBot(strafe({ seed }), () => ({ fire: true })).score).toBeLessThan(15)
  })

  it('is the share of the Run spent on target: tracking while holding fire for half of it gives about 50', () => {
    const tracker = trackBot()
    const half: Bot = (state) => ({ ...tracker(state), fire: state.t % 10_000 < 5_000 })
    expect(runBot(strafe(), half).score).toBeCloseTo(50, 0)
  })

  it('drops below a perfect tracker when the crosshair lags a quarter of a second behind', () => {
    const perfect = runBot(strafe(), trackBot()).score
    const lagging = runBot(strafe(), trackBot({ leadMs: -250 })).score
    expect(lagging).toBeLessThan(perfect - 20)
  })

  it('does not depend on the tick rate of the shell', () => {
    const a = runBot(strafe(), trackBot(), { tickMs: 1 }).score
    const b = runBot(strafe(), trackBot(), { tickMs: 16 }).score
    expect(Math.abs(a - b)).toBeLessThan(2)
  })

  it('is shown live as the percentage of the time so far, not of the whole Run', () => {
    const run = createRun(strafe())
    const bot = trackBot()
    run.push({ kind: 'down', t: 0, button: 0 })
    for (let t = 0; t < 2000; t++) {
      run.push({ kind: 'tick', t })
      const turn = bot(run.state())?.turn
      if (turn) run.push({ kind: 'move', t, dx: turn.yaw / 0.045, dy: -turn.pitch / 0.045 })
    }
    expect(run.state().score).toBeGreaterThan(90)
  })
})

describe('Strafe target', () => {
  const { seen } = playAndWatch(strafe(), trackBot())

  it('is a single target that is always alive', () => {
    expect(seen).toHaveLength(30_000)
    expect(createRun(strafe()).state().targets).toHaveLength(1)
  })

  it('moves smoothly: it never jumps more than a tenth of a degree in 1 ms, and has a size in degrees', () => {
    for (const [i, t] of seen.entries()) {
      expect(t.radius).toBe(2)
      const before = seen[i - 1]
      if (before) expect(angleBetween(before, t)).toBeLessThan(0.1)
    }
  })

  it('keeps within reach of the crosshair start and moves at human tracking speeds', () => {
    for (const t of seen) {
      expect(Math.abs(t.yaw)).toBeLessThanOrEqual(24 + 1e-9)
      expect(Math.abs(t.pitch)).toBeLessThanOrEqual(5 + 1e-9)
      expect(t.speed).toBeLessThan(55)
    }
    const mean = seen.reduce((sum, t) => sum + (t.speed ?? 0), 0) / seen.length
    expect(mean).toBeGreaterThan(10)
  })

  it('changes direction several times during a Run', () => {
    const sideways = seen.map((t) => Math.sin(((t.heading ?? 0) * Math.PI) / 180) > 0)
    const reversals = sideways.filter((right, i) => i > 0 && right !== sideways[i - 1]).length
    expect(reversals).toBeGreaterThanOrEqual(6)
  })

  it('reports the speed and heading it really moves with', () => {
    // central difference of the positions, 1 ms either side, is an independent measure of the velocity
    for (let i = 1000; i < seen.length - 1; i += 997) {
      const [before, now, after] = [seen[i - 1], seen[i], seen[i + 1]]
      if (!before || !now || !after) throw new Error('missing sample')
      const travelled = angleBetween(before, after)
      expect(now.speed).toBeCloseTo(travelled / 0.002, -0.5) // within about 1.5 degrees per second
      const predicted = offsetAim(before, travelled, now.heading ?? 0)
      expect(angleBetween(predicted, after)).toBeLessThan(0.002 * 0.05 * (now.speed ?? 0) + 1e-3)
    }
  })
})

describe('Strafe determinism and units', () => {
  it('gives the same path for the same seed, whatever the Sensitivity, DPI, FOV and aim', () => {
    const a = playAndWatch(strafe({ seed: 42 }), trackBot()).seen
    const b = playAndWatch(
      strafe({ seed: 42, sensitivity: 40, dpi: 1600, fov: { degrees: 90, axis: 'vertical' } }),
      trackBot({ leadMs: -80 }),
    ).seen
    expect(b).toEqual(a)
  })

  it('gives exactly the same result when the same seed is played the same way twice', () => {
    const play = () => runBot(strafe({ seed: 9 }), trackBot({ leadMs: -50 }))
    expect(play()).toEqual(play())
  })

  it('gives a different path for a different seed', () => {
    const at = (seed: number) => playAndWatch(strafe({ seed }), () => undefined).seen[20_000]
    expect(at(1)).not.toEqual(at(2))
  })
})

describe('Strafe path from the Run record (what Analysis needs)', () => {
  it('is recovered by replaying the recorded input one ms at a time, with the crosshair beside it', () => {
    const params = strafe({ seed: 5 })
    const { result, seen } = playAndWatch(params, trackBot({ leadMs: -120 }))
    const record: RunRecord = { ...params, id: 'r', startedAt: 0, gameProfileId: 'test', mode: 'practice', warmup: false, ...result }

    const run = createRun(record)
    let next = 0
    for (let t = 0; t < 30_000; t++) {
      run.push({ kind: 'tick', t })
      expect(run.state().targets[0]).toEqual(seen[t])
      for (let e = record.input[next]; e && e.t <= t; e = record.input[++next]) run.push(e)
    }
    expect(run.state().crosshair).not.toEqual({ yaw: 0, pitch: 0 })
  })
})
