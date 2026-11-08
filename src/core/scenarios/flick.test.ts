import { describe, expect, it } from 'vitest'
import { angleBetween } from '../aim'
import { createRun } from '../run'
import { tallyShots } from '../tally'
import { aimBot, missBot, runBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testParams } from '../testing/params'
import type { TargetEvent } from '../types'

const spawns = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'spawn')
const hits = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'shot' && e.id !== null).length
const misses = (events: readonly TargetEvent[]) => events.filter((e) => e.kind === 'shot' && e.id === null).length

describe('Flick targets', () => {
  it('spawn 10 to 60 degrees from the crosshair, with a size defined in degrees', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [target] = createRun(testParams({ seed })).state().targets
      if (!target) throw new Error('no target at the start of the Run')
      // Crosshair starts at yaw 0, pitch 0, so the angle to the target is acos(cos(pitch) x cos(yaw)).
      const toRad = Math.PI / 180
      const angle = Math.acos(Math.cos(target.pitch * toRad) * Math.cos(target.yaw * toRad)) / toRad
      expect(angle).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(angle).toBeLessThanOrEqual(60 + 1e-9)
      expect(target.radius).toBe(2)
    }
  })

  it('show one target at a time', () => {
    const run = createRun(testParams())
    expect(run.state().targets).toHaveLength(1)
  })
})

describe('Flick with a perfect-aim bot', () => {
  const result = runBot(testParams(), aimBot())

  it('hits every target and never misses a shot', () => {
    const killed = result.targetEvents.filter((e) => e.kind === 'kill').length
    expect(killed).toBeGreaterThan(50)
    expect(misses(result.targetEvents)).toBe(0)
    // every target but the one still alive when time ran out was hit
    expect(spawns(result.targetEvents).length - killed).toBe(1)
    expect(result.score).toBe(killed)
  })

  it('spawns each new target at the time of the hit, 10 to 60 degrees from the crosshair', () => {
    const events = result.targetEvents
    events.forEach((e, i) => {
      if (e.kind !== 'spawn') return
      expect(angleBetween(e.crosshair, e)).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(angleBetween(e.crosshair, e)).toBeLessThanOrEqual(60 + 1e-9)
      if (i > 0) expect(events[i - 1]).toMatchObject({ kind: 'kill', t: e.t })
    })
  })
})

describe('Flick Score = hits x accuracy', () => {
  it('is 22.5 for 30 hits out of 40 shots', () => {
    const perfect = aimBot()
    const wasteful = missBot(aimBot(), 1)
    // Waste one shot at each of the first 10 targets, then stop playing after the 30th hit.
    const bot: Bot = (state) => {
      const id = state.targets[0]?.id ?? 0
      if (id >= 30) return
      return id < 10 ? wasteful(state) : perfect(state)
    }
    const result = runBot(testParams(), bot)
    const fired = result.input.filter((e) => e.kind === 'down' && e.button === 0).length
    expect(hits(result.targetEvents)).toBe(30)
    expect(fired).toBe(40)
    expect(result.score).toBe(22.5)
  })

  it('is lower for a bot that keeps missing than for a perfect one, by the formula', () => {
    const perfect = runBot(testParams(), aimBot())
    const sloppy = runBot(testParams(), missBot(aimBot(), 2))
    const fired = sloppy.input.filter((e) => e.kind === 'down' && e.button === 0).length
    const hitCount = hits(sloppy.targetEvents)
    expect(misses(sloppy.targetEvents)).toBe(fired - hitCount)
    expect(sloppy.score).toBeCloseTo((hitCount * hitCount) / fired, 9)
    expect(sloppy.score).toBeLessThan(perfect.score / 2)
  })

  it('is reported as hits, shots and accuracy by tallyShots', () => {
    const result = runBot(testParams(), missBot(aimBot(), 1))
    const fired = result.input.filter((e) => e.kind === 'down' && e.button === 0).length
    const tally = tallyShots(result.targetEvents)
    expect(tally.shots).toBe(fired)
    expect(tally.accuracy).toBeCloseTo(tally.hits / fired, 12)
    expect(result.score).toBeCloseTo(tally.hits * tally.accuracy, 9)
    expect(tallyShots([])).toEqual({ hits: 0, shots: 0, accuracy: 0 })
  })

  it('is 0 when no shot was fired', () => {
    expect(runBot(testParams(), () => undefined).score).toBe(0)
  })
})

describe('Flick determinism', () => {
  it('gives the same target sequence for the same seed, regardless of Sensitivity, DPI, FOV and aim', () => {
    const a = runBot(testParams({ seed: 42 }), aimBot())
    const b = runBot(
      testParams({ seed: 42, sensitivity: 40, dpi: 1600, fov: { degrees: 90, axis: 'vertical' } }),
      aimBot({ gain: 1.3, moveMs: 200 }),
    )
    // Where the crosshair is differs between players, so the sequence is the distance of each target.
    const distances = (r: typeof a) => spawns(r.targetEvents).map((e) => angleBetween(e.crosshair, e))
    const [da, db] = [distances(a), distances(b)]
    expect(da.length).toBeGreaterThan(10)
    expect(db.length).toBeGreaterThan(10)
    const n = Math.min(da.length, db.length)
    expect(db.slice(0, n)).toEqual(da.slice(0, n).map((d) => expect.closeTo(d, 6)))
  })

  it('gives a different target sequence for a different seed', () => {
    const first = (seed: number) => createRun(testParams({ seed })).state().targets[0]
    expect(first(1)).not.toEqual(first(2))
  })
})
