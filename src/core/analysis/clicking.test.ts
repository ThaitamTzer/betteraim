import { describe, expect, it } from 'vitest'
import type { RunParams, RunRecord } from '../types'
import { aimBot, missBot, runBot } from '../testing/bots'
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

    it('of a bot that stops short is an Undershoot in every Aim Movement', () => {
      const { analysis } = analyse(aimBot({ gain: 0.7 }), setup, tickMs)
      expect(analysis.movementCount).toBeGreaterThan(30)
      expect(analysis.movements.filter((m) => m.outcome !== 'undershoot')).toEqual([])
      expect(analysis.undershootRate).toBe(1)
      expect(analysis.overshootRate).toBe(0)
    })
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
