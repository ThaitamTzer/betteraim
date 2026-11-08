import { describe, expect, it } from 'vitest'
import type { RunParams, RunRecord } from '../types'
import { aimBot, lineBot, missBot, runBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testMeta, testParams } from '../testing/params'
import { analyseRun } from '.'

// Three mouse setups, one of them coarse (0.15 degrees per count), so thresholds are not tuned to one setting.
const setups: Partial<RunParams>[] = [
  { sensitivity: 25.4, dpi: 800 },
  { sensitivity: 40, dpi: 1600 },
  { sensitivity: 15, dpi: 400 },
]

/** Plays a Flick Run with a bot and analyses the resulting Run record, as the app does. */
const analyse = (bot: Bot, setup: Partial<RunParams> = {}, tickMs = 1) => {
  const params = testParams(setup)
  const record: RunRecord = { ...params, ...testMeta(), ...runBot(params, bot, { tickMs }) }
  const analysis = analyseRun(record)
  if (analysis.category !== 'clicking') throw new Error(`expected a clicking analysis, got ${analysis.category}`)
  return { record, analysis }
}
const kills = (record: RunRecord) => record.targetEvents.filter((e) => e.kind === 'kill')

// Flick targets are 10 to 60 degrees away with a 2 degree radius, so a 30% overshoot ends 1 to 16 degrees past the centre
// and 70% ends 3 to 18 degrees short of it; each is outside the near/far edge for every movement.
describe.each(setups)('Primary Submovement at $sensitivity cm/360, $dpi DPI', (setup) => {
  describe.each([1, 8])('with %i ms between ticks', (tickMs) => {
    it('of a perfect bot ends on the target in every Aim Movement', () => {
      const { analysis } = analyse(aimBot(), setup, tickMs)
      expect(analysis.movementCount).toBeGreaterThan(50)
      expect(analysis.movements.filter((m) => m.outcome !== 'on-target')).toEqual([])
      expect(analysis.overshootRate).toBe(0)
      expect(analysis.undershootRate).toBe(0)
    })

    it('of a bot that overshoots by 30% is an Overshoot in every Aim Movement', () => {
      const { analysis } = analyse(aimBot({ gain: 1.3 }), setup, tickMs)
      expect(analysis.movementCount).toBeGreaterThan(30)
      expect(analysis.movements.filter((m) => m.outcome !== 'overshoot')).toEqual([])
      expect(analysis.overshootRate).toBe(1)
      expect(analysis.undershootRate).toBe(0)
      expect(analysis.overshoots).toBe(analysis.movementCount)
    })

    it('is found after a reaction time too: an overshoot is still an Overshoot', () => {
      const { analysis } = analyse(aimBot({ gain: 1.3, reactionMs: 250 }), setup, tickMs)
      expect(analysis.movements.filter((m) => m.outcome !== 'overshoot')).toEqual([])
      expect(analysis.smoothness).toBeCloseTo(2, 1)
    })

    it('of a bot that stops short is an Undershoot in every Aim Movement', () => {
      const { analysis } = analyse(aimBot({ gain: 0.7 }), setup, tickMs)
      expect(analysis.movementCount).toBeGreaterThan(30)
      expect(analysis.movements.filter((m) => m.outcome !== 'undershoot')).toEqual([])
      expect(analysis.undershootRate).toBe(1)
      expect(analysis.overshootRate).toBe(0)
    })
  })
})

describe.each(setups)('Smoothness at $sensitivity cm/360, $dpi DPI', (setup) => {
  it('is one velocity peak per Aim Movement for a smooth bot, whatever the integer counts do', () => {
    const { analysis } = analyse(lineBot(), setup)
    expect(analysis.smoothness).toBeCloseTo(1, 1)
    expect(Math.max(...analysis.movements.map((m) => m.velocityPeaks))).toBeLessThanOrEqual(1)
  })

  it('counts a correction as a peak: a bot that overshoots has two', () => {
    expect(analyse(aimBot({ gain: 1.3 }), setup).analysis.smoothness).toBeCloseTo(2, 1)
  })

  it('is higher for a jerky bot that moves in four bursts than for a smooth one', () => {
    const smooth = analyse(lineBot(), setup).analysis.smoothness
    const jerky = analyse(lineBot({ bursts: 4, burstMs: 40, pauseMs: 30 }), setup).analysis.smoothness
    expect(jerky).toBeCloseTo(4, 1)
    expect(jerky).toBeGreaterThan(smooth + 2)
  })
})

describe.each(setups)('Path Deviation at $sensitivity cm/360, $dpi DPI', (setup) => {
  it.each([1, 8])('is close to zero for a bot that follows the Ideal Path, with %i ms between ticks', (tickMs) => {
    const { analysis } = analyse(lineBot(), setup, tickMs)
    expect(analysis.pathDeviation).toBeLessThan(0.1)
    // overshooting or stopping short along the line is still on the line
    expect(analyse(lineBot({ burstMs: 60, bursts: 3, pauseMs: 40 }), setup, tickMs).analysis.pathDeviation).toBeLessThan(0.1)
  })

  it('is the mean perpendicular distance in degrees: a path bowed 4 degrees at its midpoint averages about 2.5', () => {
    const { analysis } = analyse(lineBot({ bow: 4 }), setup)
    // mean of |4 sin(pi x)| along the path is 4 x 2/pi = 2.55; the speed weighting moves it a little
    expect(analysis.pathDeviation).toBeGreaterThan(2)
    expect(analysis.pathDeviation).toBeLessThan(3)
    expect(analysis.movements.every((m) => m.pathDeviation > 1)).toBe(true)
  })
})

describe.each(setups)('Mouse speed at $sensitivity cm/360, $dpi DPI', (setup) => {
  it.each([1, 8])('is the angular distance travelled over the time from target appearance to hit, with %i ms ticks', (tickMs) => {
    const { analysis } = analyse(lineBot(), setup, tickMs)
    // a straight line, so the distance travelled is the Ideal Path
    const expected =
      analysis.movements.reduce((sum, m) => sum + m.idealDistance, 0) /
      (analysis.movements.reduce((sum, m) => sum + m.endMs - m.startMs, 0) / 1000)
    expect(analysis.mouseSpeed).toBeGreaterThan(expected * 0.95)
    expect(analysis.mouseSpeed).toBeLessThan(expected * 1.05)
  })

  it('is higher for a bot that swings faster', () => {
    const slow = analyse(lineBot({ burstMs: 240 }), setup).analysis.mouseSpeed
    const fast = analyse(lineBot({ burstMs: 80 }), setup).analysis.mouseSpeed
    expect(fast).toBeGreaterThan(slow * 1.5)
  })
})

describe('an Aim Movement too slow to have any velocity peak', () => {
  it('has no Primary Submovement to misjudge: it is on-target because it hit', () => {
    // 25 s to cover 10 to 60 degrees is under 5 degrees per second all the way
    const { analysis } = analyse(lineBot({ burstMs: 25_000 }))
    expect(analysis.movementCount).toBe(1)
    expect(analysis.movements[0]).toMatchObject({ velocityPeaks: 0, outcome: 'on-target' })
  })
})

describe('Aim Movements', () => {
  it('run from target appearance to the hit that kills it, and the target still alive at the end is not one', () => {
    const { record, analysis } = analyse(aimBot())
    expect(analysis.movementCount).toBeGreaterThan(50)
    expect(analysis.movements).toHaveLength(kills(record).length)
    expect(analysis.movements[0]).toMatchObject({ startMs: 0, endMs: kills(record)[0]?.t })
  })

  it('are not ended by a missed shot', () => {
    const { record, analysis } = analyse(missBot(aimBot(), 2))
    expect(analysis.movements).toHaveLength(kills(record).length)
    expect(analysis.shots).toBeGreaterThan(analysis.hits)
    expect(analysis.accuracy).toBeCloseTo(1 / 3, 1) // two wasted shots and one hit per target
    analysis.movements.forEach((m, i) => expect(m.endMs).toBe(kills(record)[i]?.t))
  })
})
