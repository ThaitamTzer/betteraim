import { describe, expect, it } from 'vitest'
import { aimDelta, angleBetween } from '../aim'
import { createRun, RUN_DURATION_MS } from '../run'
import { runBot, trackBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testParams } from '../testing/params'
import type { RunParams, RunRecord, RunState, TargetEvent } from '../types'
import { getScenario } from './index'

const sw = (overrides: Partial<RunParams> = {}) => testParams({ scenario: 'switch', ...overrides })
const kills = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'kill')
const spawns = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'spawn')

/** Plays `bot` and keeps the RunState it was shown at every tick (1 ms apart). */
const live = (params: RunParams, bot: Bot) => {
  const states: RunState[] = []
  const result = runBot(params, (state) => {
    states.push(state)
    return bot(state)
  })
  return { result, states }
}

/** Aims at the live target with this id, if there is one, and holds fire; `held` can veto the fire button. */
const aimAt = (pick: (t: number) => number, held: (t: number) => boolean = () => true): Bot => (state) => {
  const target = state.targets.find((x) => x.id === pick(state.t))
  return { turn: target && aimDelta(state.crosshair, target), fire: held(state.t) }
}

describe('Switch Score = targets eliminated', () => {
  it('is registered as a Tracking Scenario with a label and description for the picker', () => {
    const s = getScenario('switch')
    expect(s.category).toBe('tracking')
    expect(s.name).toBe('Switch')
    expect(s.description.length).toBeGreaterThan(0)
  })

  it('is 0 for an idle bot', () => {
    expect(runBot(sw(), () => undefined).score).toBe(0)
  })

  it('is 75 for a bot that tracks every target with no time lost: 400 ms each fills the 30 s', () => {
    const { score, targetEvents } = runBot(sw(), trackBot())
    expect(score).toBe(75)
    expect(kills(targetEvents)).toHaveLength(75)
  })

  it('is lower for a bot that trails the targets than for one that is dead on', () => {
    expect(runBot(sw(), trackBot({ leadMs: -250 })).score).toBeLessThan(70)
  })

  it('does not depend on the tick rate of the shell', () => {
    expect(runBot(sw(), trackBot(), { tickMs: 16 }).score).toBeGreaterThan(70)
  })
})

describe('Switch rule: a target falls after 0.4 s on target', () => {
  const killedAt = (id: number, bot: Bot) =>
    kills(runBot(sw(), bot).targetEvents).find((e) => e.id === id)?.t

  it('falls 400 ms after the crosshair got on it while fire is held', () => {
    expect(killedAt(0, aimAt(() => 0))).toBe(400)
  })

  it('counts only the time fire is held: held in 100 ms bursts it is credited in 1-100, 201-300, 401-500 and 601-700', () => {
    expect(killedAt(0, aimAt(() => 0, (t) => t % 200 < 100))).toBe(700)
  })

  it('counts only the time the crosshair is on the target', () => {
    // 100 ms elsewhere (aiming at nothing, on the middle of the screen), then 400 ms on target 0
    const bot: Bot = (state) => {
      if (state.t < 100) return { fire: true }
      return aimAt(() => 0)(state)
    }
    // the target is 8 degrees or more from the starting crosshair, so no time was credited before t = 100
    expect(killedAt(0, bot)).toBe(500)
  })

  it('keeps the time already on a target when the crosshair switches away and back', () => {
    // 200 ms on target 0, 100 ms on target 1, then 200 ms on target 0 again: it falls at 500, not 700
    const bot = aimAt((t) => (t >= 200 && t < 300 ? 1 : 0))
    const { targetEvents } = runBot(sw(), bot)
    expect(kills(targetEvents).find((e) => e.id === 0)?.t).toBe(500)
    // target 1 had 100 ms of its 400 and is still standing
    expect(kills(targetEvents).find((e) => e.id === 1)?.t ?? Infinity).toBeGreaterThan(500)
  })

  it('does not fall for a target that was only touched briefly', () => {
    const bot = aimAt((t) => (t < 399 ? 0 : 1))
    expect(killedAt(0, bot)).toBeUndefined()
  })
})

describe('Switch targets', () => {
  const { result, states } = live(sw(), trackBot())

  it('are three at once, all the time, with a size in degrees', () => {
    expect(states.every((s) => s.targets.length === 3)).toBe(true)
    expect(states.every((s) => s.targets.every((t) => t.radius === 2))).toBe(true)
  })

  it('are never close enough together to be on target at the same time', () => {
    for (const s of states) {
      for (const [i, a] of s.targets.entries()) {
        for (const b of s.targets.slice(i + 1)) expect(angleBetween(a, b)).toBeGreaterThan(12)
      }
    }
  })

  it('drift slowly, and move smoothly', () => {
    for (const [i, s] of states.entries()) {
      for (const t of s.targets) {
        expect(t.speed).toBeLessThan(15)
        expect(t.heading).toBeGreaterThanOrEqual(0)
        expect(t.heading).toBeLessThan(360)
        const before = states[i - 1]?.targets.find((x) => x.id === t.id)
        if (before) expect(angleBetween(before, t)).toBeLessThan(0.05)
      }
    }
  })

  it('spawn three at the start, and a replacement the moment one falls, far from where it fell', () => {
    const events = result.targetEvents
    expect(spawns(events).filter((e) => e.t === 0)).toHaveLength(3)
    expect(spawns(events)).toHaveLength(3 + kills(events).length)
    events.forEach((e, i) => {
      const fell = events[i - 1]
      if (e.kind !== 'spawn' || e.t === 0 || fell?.kind !== 'kill') return
      expect(fell.t).toBe(e.t)
      // the replacement is not under the crosshair: the player has to switch
      expect(angleBetween(e.crosshair, e)).toBeGreaterThan(8)
    })
  })

  it('are gone once they fell', () => {
    const fell = kills(result.targetEvents)
    expect(new Set(fell.map((e) => e.id)).size).toBe(75)
    for (const { id, t } of fell) {
      expect(states[t - 1]?.targets.some((x) => x.id === id) ?? true).toBe(true) // alive the tick before
      expect(states[t]?.targets.some((x) => x.id === id) ?? false).toBe(false) // gone at the tick it fell
    }
  })
})

describe('Switch determinism and units', () => {
  const shape = (events: readonly TargetEvent[]) =>
    events.map((e) => (e.kind === 'spawn' ? { ...e, crosshair: undefined } : e))

  it('gives the same targets for the same seed, whatever the Sensitivity, DPI and FOV', () => {
    const a = runBot(sw({ seed: 42 }), trackBot())
    const b = runBot(
      sw({ seed: 42, sensitivity: 40, dpi: 1600, fov: { degrees: 90, axis: 'vertical' } }),
      trackBot(),
    )
    expect(a.score).toBe(75)
    expect(shape(b.targetEvents)).toEqual(shape(a.targetEvents))
  })

  it('gives exactly the same result when the same seed is played the same way twice', () => {
    const play = () => runBot(sw({ seed: 9 }), trackBot({ leadMs: -50 }))
    expect(play()).toEqual(play())
  })

  it('gives different targets for a different seed', () => {
    const first = (seed: number) => spawns(runBot(sw({ seed }), () => undefined).targetEvents)
    expect(first(1)).not.toEqual(first(2))
  })

  it('has its targets and heading recovered by replaying the recorded input one ms at a time', () => {
    const params = sw({ seed: 5 })
    const { result: played, states } = live(params, trackBot({ leadMs: -100 }))
    const record: RunRecord = { ...params, id: 'r', startedAt: 0, gameProfileId: 'test', mode: 'practice', warmup: false, ...played }
    const run = createRun(record)
    let next = 0
    for (let t = 0; t < RUN_DURATION_MS; t++) {
      run.push({ kind: 'tick', t })
      expect(run.state().targets).toEqual(states[t]?.targets)
      for (let e = record.input[next]; e && e.t <= t; e = record.input[++next]) run.push(e)
    }
  })
})
