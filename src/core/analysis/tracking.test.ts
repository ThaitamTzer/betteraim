import { describe, expect, expectTypeOf, it } from 'vitest'
import { aimDelta, offsetAim } from '../aim'
import { replaySteps } from '../run'
import type { Aim, RunParams, RunRecord, Target } from '../types'
import { runBot, trackBot } from '../testing/bots'
import type { Bot } from '../testing/bots'
import { testMeta, testParams } from '../testing/params'
import { analyseRun, leadOf } from '.'
import type { TrackingAnalysis } from '.'

// Three mouse setups, one of them coarse (0.15 degrees per count), and one non-default FOV: nothing may depend on them.
const setups: Partial<RunParams>[] = [
  { sensitivity: 25.4, dpi: 800 },
  { sensitivity: 40, dpi: 1600, fov: { degrees: 90, axis: 'vertical' } },
  { sensitivity: 15, dpi: 400 },
]
const scenarios = ['strafe', 'switch'] as const

/** Plays a Tracking Run with a bot and analyses the resulting Run record, as the app does. */
const analyse = (scenario: RunParams['scenario'], bot: Bot, setup: Partial<RunParams> = {}) => {
  const params = testParams({ scenario, ...setup })
  const record: RunRecord = { ...params, ...testMeta(), ...runBot(params, bot) }
  const analysis = analyseRun(record)
  if (analysis.category !== 'tracking') throw new Error(`expected a tracking analysis, got ${analysis.category}`)
  return { record, analysis }
}

describe.each(scenarios)('Ahead/Behind in %s', (scenario) => {
  describe.each(setups)('at $sensitivity cm/360, $dpi DPI', (setup) => {
    it('reports a bot that leads the target as Ahead, by a positive offset', () => {
      const { analysis } = analyse(scenario, trackBot({ leadMs: 150 }), setup)
      expect(analysis.lead).toBe('ahead')
      expect(analysis.meanOffset).toBeGreaterThan(0.25)
    })

    it('reports a bot that trails the target as Behind, by a negative offset', () => {
      const { analysis } = analyse(scenario, trackBot({ leadMs: -150 }), setup)
      expect(analysis.lead).toBe('behind')
      expect(analysis.meanOffset).toBeLessThan(-0.25)
    })

    it('reports a perfect bot as level with the target', () => {
      const { analysis } = analyse(scenario, trackBot(), setup)
      expect(analysis.lead).toBe('level')
      expect(Math.abs(analysis.meanOffset)).toBeLessThan(0.1)
    })
  })
})

describe.each(setups)('Time on Target at $sensitivity cm/360, $dpi DPI', (setup) => {
  it('is the Strafe Score as a share of the Run, for a bot that keeps leaving the target', () => {
    for (const leadMs of [0, -100, 100]) {
      const { analysis, record } = analyse('strafe', trackBot({ leadMs }), setup)
      expect(analysis.timeOnTargetMs).toBeCloseTo(record.score * 300, 5)
      expect(analysis.timeOnTargetShare * 100).toBeCloseTo(record.score, 5)
    }
    // the bots above really do leave the target, so the check is not 100 = 100
    expect(analyse('strafe', trackBot({ leadMs: -100 }), setup).analysis.timeOnTargetShare).toBeLessThan(0.8)
  })

  it('counts the whole 400 ms of every Switch fall, though the replacement is already on screen at the last ms', () => {
    const { analysis, record } = analyse('switch', trackBot(), setup)
    expect(record.score).toBe(75)
    expect(analysis.timeOnTargetMs).toBe(30000)
    expect(analysis.timeOnTargetShare).toBe(1)
    const lagging = analyse('switch', trackBot({ leadMs: -250 }), setup)
    expect(lagging.analysis.timeOnTargetMs).toBeGreaterThanOrEqual(400 * lagging.record.score)
    expect(lagging.analysis.timeOnTargetMs).toBeLessThan(400 * lagging.record.score + 3 * 400)
  })
})

describe('which steps are sampled', () => {
  /** The first of the targets, or nothing; used to place the crosshair relative to it. */
  const onFirst = (build: (target: Target) => Aim | void, fire = true): Bot => (state) => {
    const target = state.targets[0]
    const aim = target && build(target)
    return { turn: aim ? aimDelta(state.crosshair, aim) : undefined, fire }
  }

  it.each(scenarios)('takes no sample, and no Time on Target, from a bot that tracks without firing in %s', (scenario) => {
    const { analysis } = analyse(scenario, onFirst((t) => t, false))
    expect(analysis).toMatchObject({ samples: 0, timeOnTargetMs: 0, meanOffset: 0, mouseSpeed: 0, lead: 'level' })
  })

  it.each(scenarios)('takes no sample from a bot that holds fire while looking far from every target in %s', (scenario) => {
    const { analysis } = analyse(scenario, onFirst(() => ({ yaw: 0, pitch: -70 })))
    expect(analysis).toMatchObject({ samples: 0, timeOnTargetMs: 0, meanOffset: 0 })
  })

  it('reads along the direction of travel only: a bot beside the target, not ahead of it, is level', () => {
    // 1.5 degrees to the side of the heading: still tracking (within the window) but neither Ahead nor Behind.
    const beside = onFirst((t) => offsetAim(t, 1.5, (t.heading ?? 0) + 90))
    for (const scenario of scenarios) {
      const { analysis } = analyse(scenario, beside)
      expect(analysis.samples).toBeGreaterThan(10000)
      expect(analysis.lead).toBe('level')
      expect(Math.abs(analysis.meanOffset)).toBeLessThan(0.05)
    }
  })

  it('reads the offset in proportion to the lead, with the same size for Ahead as for Behind', () => {
    const offset = (leadMs: number) => analyse('strafe', trackBot({ leadMs })).analysis.meanOffset
    expect(offset(80)).toBeCloseTo(-offset(-80), 1)
    expect(offset(80)).toBeCloseTo(2 * offset(40), 1)
    // 80 ms of the target's travel at Strafe's average speed of about 18 deg/s: about 1.4 degrees
    expect(offset(80)).toBeGreaterThan(1.2)
    expect(offset(80)).toBeLessThan(1.7)
  })

  it('does not count a flick between Switch targets: mouse speed stays that of the targets, not of the flick', () => {
    // The same dead-on tracker, but it can turn at most 0.3 degrees per ms (300 deg/s), so it takes a while to get from
    // one target to the next, passing through the tracking window of the new one at speed.
    const tracker = trackBot()
    const flicking: Bot = (state) => {
      const action = tracker(state)
      const turn = action?.turn
      const size = turn ? Math.hypot(turn.yaw, turn.pitch) : 0
      return { ...action, turn: turn && size > 0.3 ? { yaw: (turn.yaw * 0.3) / size, pitch: (turn.pitch * 0.3) / size } : turn }
    }
    const dead = analyse('switch', trackBot()).analysis
    const flick = analyse('switch', flicking)
    expect(flick.record.score).toBeLessThan(60) // it does spend time flicking
    expect(flick.analysis.mouseSpeed).toBeCloseTo(dead.mouseSpeed, 0)
    expect(Math.abs(flick.analysis.meanOffset)).toBeLessThan(0.05)
  })
})

describe.each(setups)('Mouse speed at $sensitivity cm/360, $dpi DPI', (setup) => {
  it.each(scenarios)('of a dead-on tracker is the speed of the %s target, in degrees per second, whatever the counts', (scenario) => {
    const { analysis, record } = analyse(scenario, trackBot(), setup)
    // The targets' own speed, read from the Run replay: an independent source for what the crosshair had to do.
    let sum = 0
    let n = 0
    replaySteps(record, record.input, ({ targets }) => {
      for (const target of targets) {
        sum += target.speed ?? 0
        n++
      }
    })
    expect(analysis.mouseSpeed).toBeGreaterThan(3)
    // a 0.15 degree count is not allowed to add speed: signed steps are smoothed, not their magnitudes
    expect(analysis.mouseSpeed).toBeGreaterThan(0.9 * (sum / n))
    expect(analysis.mouseSpeed).toBeLessThan(1.1 * (sum / n))
  })
})

describe('the analysis of a record', () => {
  it('is the same after the record went through JSON and back: nothing but the record is needed', () => {
    const { record, analysis } = analyse('strafe', trackBot({ leadMs: 60 }))
    expect(analyseRun(JSON.parse(JSON.stringify(record)) as RunRecord)).toEqual(analysis)
  })

  it('has no Overshoot or Undershoot anywhere: those belong to Aim Movements', () => {
    // type level: `pnpm typecheck` fails if the Tracking variant gains such a field
    type Banned = Extract<keyof TrackingAnalysis, `${string}${'over' | 'Over' | 'under' | 'Under'}shoot${string}`>
    expectTypeOf<Banned>().toEqualTypeOf<never>()
    // @ts-expect-error a Tracking Run has no overshoots
    const absent = ({} as TrackingAnalysis).overshoots
    expect(absent).toBeUndefined()
    // runtime: neither a key of the result nor a word of its classification
    for (const scenario of scenarios) {
      const { analysis } = analyse(scenario, trackBot({ leadMs: 100 }))
      expect(Object.keys(analysis).filter((key) => /overshoot|undershoot/i.test(key))).toEqual([])
      expect(analysis.lead).not.toMatch(/overshoot|undershoot/i)
    }
  })
})

describe('leadOf', () => {
  it('calls an offset past the dead zone Ahead or Behind and a smaller one level', () => {
    expect([leadOf(0.3), leadOf(-0.3), leadOf(0.2), leadOf(-0.2), leadOf(0)]).toEqual(['ahead', 'behind', 'level', 'level', 'level'])
  })
})
