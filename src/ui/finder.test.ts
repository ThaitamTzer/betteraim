import { describe, expect, it } from 'vitest'
import { cm360For, coarseLevels, fitFinder, getGameProfile, nextSession } from '../core'
import { testRecord } from '../core/testing/records'
import { syntheticPlayer, syntheticRuns } from '../core/testing/synthetic'
import { fmt } from './format'
import { RAW_INPUT_BROWSERS } from '../input/pointer'
import { centreOf, MIN_REST_SECONDS, newFinderSession, runLabel, runRoute, sessionEnd, stepView } from './finder'
import type { FinderStep } from './finder'

const settings = { gameProfileId: 'valorant', gameSensitivity: 0.4, dpi: 800 } as const
const { weights } = getGameProfile('valorant')
/** The Session of a player who has never played the Finder: coarse, centred on their own Sensitivity. */
const START = nextSession(fitFinder([], { weights }), centreOf(settings))
const session = (done = 0) => ({ ...newFinderSession(settings, 7, 'session-a', START), done })
/** After 8 coarse Sessions of a player whose optimum is 33 cm/360 the interval is under +-25%: the next Session is the fine phase. */
const FINE = nextSession(fitFinder(syntheticRuns(syntheticPlayer({ optimum: 33 }), Array.from({ length: 8 }, () => ({ levels: coarseLevels(40) })), 1), { weights }), centreOf(settings))
const fineSession = (done = 0) => ({ ...newFinderSession(settings, 7, 'session-f', FINE), done })
const STEPS: FinderStep[] = ['rest', 'abandoned', 'notRaw']

/** Every way a Sensitivity could be printed: full precision, the app's 4 significant digits, 1 and 2 decimals. */
const spellings = (cm360: number) => [String(cm360), fmt(cm360), cm360.toFixed(1), cm360.toFixed(2)]

describe('a Finder Session', () => {
  it('is centred on the player Sensitivity, with the Game Profile weights and FOV', () => {
    const s = session()
    const centre = cm360For('valorant', 0.4, 800)
    expect(s.plan.filter((r) => r.warmup).map((r) => r.sensitivity)).toEqual([centre, centre])
    expect(new Set(s.plan.filter((r) => !r.warmup).map((r) => r.sensitivity))).toEqual(new Set(coarseLevels(centre)))
    expect(s.levels).toBe(7)
    expect(s.fov).toEqual({ degrees: expect.closeTo(70.53, 1), axis: 'vertical' }) // the Game Profile FOV, never the Practice override
  })

  it('plays the planner\'s levels around its Centre: in the fine phase 5 levels, a shorter Session, and RunMeta.levels says 5', () => {
    expect(FINE).toMatchObject({ phase: 'fine', reason: 'fine' })
    const s = fineSession()
    expect(s.levels).toBe(5)
    expect(s.plan).toHaveLength(2 + 2 * 5)
    expect(s.plan.filter((r) => r.warmup).map((r) => r.sensitivity)).toEqual([FINE.centre, FINE.centre])
    expect(new Set(s.plan.filter((r) => !r.warmup).map((r) => r.sensitivity))).toEqual(new Set(FINE.levels))
    expect(runRoute(fineSession(2)).meta).toMatchObject({ mode: 'finder', sessionId: 'session-f', levels: 5 })
    expect(runRoute(fineSession(11)).next(testRecord())).toMatchObject({ name: 'finderResult', sessionId: 'session-f' })
  })

  it('plays each planned Run as a Finder Run of the Session, with the Warm-up flag and level count', () => {
    const s = session(2)
    const route = runRoute(s)
    const planned = s.plan[2]
    expect(route.params).toMatchObject({ scenario: planned?.scenario, seed: planned?.seed, sensitivity: planned?.sensitivity, dpi: 800, fov: s.fov })
    expect(route.meta).toEqual({ gameProfileId: 'valorant', mode: 'finder', warmup: false, sessionId: 'session-a', levels: 7 })
    expect(runRoute(session(0)).meta.warmup).toBe(true)
    expect(runRoute(session(1)).meta.warmup).toBe(true)
  })

  it('chains Run to rest to next Run, and ends on the Finder result, waiting for the last Run to be saved', () => {
    const next = runRoute(session(4)).next(testRecord())
    expect(next).toMatchObject({ name: 'finderSession', step: 'rest', session: { done: 5 } })
    const record = testRecord({}, { id: 'last-run' })
    const last = runRoute(session(15)).next(record)
    expect(last).toEqual(sessionEnd({ ...session(15), done: 16 }, record))
    expect(last).toEqual({ name: 'finderResult', gameProfileId: 'valorant', dpi: 800, sessionId: 'session-a', saving: 'last-run' })
  })

  it('returns to a screen of the Session when a Run is abandoned or the lock is not raw', () => {
    const { session: guard } = runRoute(session(3))
    expect(guard?.onAbandon).toMatchObject({ name: 'finderSession', step: 'abandoned', session: { done: 3 } })
    expect(guard?.onNotRaw).toMatchObject({ name: 'finderSession', step: 'notRaw', session: { done: 3 } })
  })
})

describe('progress', () => {
  it('counts Runs of the whole Session and marks the Warm-up Runs', () => {
    expect(runLabel(session(0))).toBe('Run 1 of 16 (warm-up)')
    expect(runLabel(session(4))).toBe('Run 5 of 16')
    expect(stepView(session(4), 'rest')).toMatchObject({ progress: { done: 4, total: 16 } })
    expect(stepView(session(4), 'rest').lines.join(' ')).toContain('Run 5 of 16')
  })

  it('has a rest long enough to matter', () => {
    expect(MIN_REST_SECONDS).toBeGreaterThanOrEqual(5)
  })

  it('tells an abandoned Run from a quit: finished Runs stay saved', () => {
    const view = stepView(session(6), 'abandoned')
    expect(view.heading).toBe('Run abandoned')
    expect(view.lines.join(' ')).toContain('6 of 16')
  })
})

describe('the raw input explanation', () => {
  it('names the supported browsers and says Practice still works', () => {
    const text = stepView(session(0), 'notRaw').lines.join(' ')
    for (const name of ['Chrome', 'Edge', 'Firefox', 'Safari']) expect(RAW_INPUT_BROWSERS).toContain(name)
    expect(text).toContain(RAW_INPUT_BROWSERS)
    expect(text).toContain('Practice')
  })
})

describe('the Sensitivity stays hidden', () => {
  it('appears in no screen text of any step at any point of the Session', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let done = 0; done <= 16; done++) {
        for (const next of [START, FINE]) {
          const s = { ...newFinderSession(settings, seed, `s${seed}`, next), done: Math.min(done, next.levels.length * 2 + 2) }
          const texts = [runLabel(s), ...STEPS.map((step) => JSON.stringify(stepView(s, step)))]
          for (const run of s.plan) {
            for (const spelling of spellings(run.sensitivity)) {
              for (const text of texts) expect(text).not.toContain(spelling)
            }
          }
        }
      }
    }
  })

  it('also not as the centre or in the Run label of a Warm-up Run', () => {
    const s = session(0)
    const centre = cm360For('valorant', 0.4, 800)
    for (const spelling of spellings(centre)) expect(runLabel(s)).not.toContain(spelling)
  })

  it('is a real check: the guard would catch a view that printed it', () => {
    const s = session(4)
    const leaky = JSON.stringify({ lines: [`Next: ${fmt(s.plan[4]?.sensitivity ?? 0)} cm/360`] })
    expect(spellings(s.plan[4]?.sensitivity ?? 0).some((x) => leaky.includes(x))).toBe(true)
  })
})
