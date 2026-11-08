import { describe, expect, it } from 'vitest'
import { coarseLevels } from './plan'
import { fitFinder } from './model'
import type { FinderFit } from './model'
import { nextSession } from './next'
import { syntheticPlayer, syntheticRuns } from '../testing/synthetic'
import type { SyntheticSession } from '../testing/synthetic'

const WEIGHTS = { clicking: 0.7, tracking: 0.3 }
const FALLBACK = 40
const coarse = (n: number, centre = FALLBACK): SyntheticSession[] => Array.from({ length: n }, () => ({ levels: coarseLevels(centre) }))
const fitOf = (sessions: SyntheticSession[], optimum: number, seed = 1) =>
  fitFinder(syntheticRuns(syntheticPlayer({ optimum, noise: 0.05 }), sessions, seed), { weights: WEIGHTS })
/** A real fit whose interval is replaced, to test the +-25% line exactly. */
const withHalfWidth = (halfWidth: number): FinderFit => {
  const fit = fitOf(coarse(8), 33)
  return { ...fit, interval: { ...fit.interval!, halfWidth } }
}
const logSteps = (levels: number[]) => levels.slice(1).map((l, i) => l / levels[i]!)

describe('the next Session', () => {
  it('starts coarse on the player Sensitivity when there is no data', () => {
    const plan = nextSession(fitFinder([], { weights: WEIGHTS }), FALLBACK)
    expect(plan).toEqual({ phase: 'coarse', centre: FALLBACK, levels: coarseLevels(FALLBACK), reason: 'start' })
    // too little to draw a curve is the same as nothing: one abandoned Session
    const abandoned = fitFinder(syntheticRuns(syntheticPlayer(), [{ levels: coarseLevels(FALLBACK), abandonAfter: 6 }], 1), { weights: WEIGHTS })
    expect(nextSession(abandoned, FALLBACK).reason).toBe('start')
  })

  describe('the phase', () => {
    it('is fine once the interval is narrower than +-25%, with 5 log-spaced levels from -20% to +20% of the Curve Peak', () => {
      const fit = withHalfWidth(0.2499)
      const plan = nextSession(fit, FALLBACK)
      expect(plan).toMatchObject({ phase: 'fine', centre: fit.peak, reason: 'fine' })
      expect(plan.levels).toHaveLength(5)
      expect(plan.levels[0]).toBeCloseTo(fit.peak! * 0.8, 9)
      expect(plan.levels[4]).toBeCloseTo(fit.peak! * 1.2, 9)
      const steps = logSteps(plan.levels)
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-12)
      for (const level of plan.levels) expect(Math.abs(level / fit.peak! - 1)).toBeLessThanOrEqual(0.2 + 1e-12)
    })

    it('stays coarse at +-25% and wider, centred on the Curve Peak', () => {
      for (const halfWidth of [0.25, 0.4]) {
        const fit = withHalfWidth(halfWidth)
        const plan = nextSession(fit, FALLBACK)
        expect(plan).toMatchObject({ phase: 'coarse', centre: fit.peak, reason: 'coarse' })
        expect(plan.levels).toEqual(coarseLevels(fit.peak!))
      }
    })

    it('switches along the real data: wide intervals after 2 Sessions, fine from the Session that narrows it under +-25%', () => {
      const seen = [2, 3, 4, 5, 6, 8].map((n) => {
        const fit = fitFinder(syntheticRuns(syntheticPlayer({ optimum: 33 }), coarse(n), 1), { weights: WEIGHTS }) // the default, noisier player
        const plan = nextSession(fit, FALLBACK)
        expect(plan.phase, `${n} Sessions, half-width ${fit.interval!.halfWidth}`).toBe(fit.interval!.halfWidth < 0.25 ? 'fine' : 'coarse')
        return plan.phase
      })
      expect(seen[0]).toBe('coarse')
      expect(seen.at(-1)).toBe('fine')
    })

    it('stays coarse, centred on the peak, while it has no interval yet', () => {
      const fit = fitOf(coarse(1), 33)
      expect(fit).toMatchObject({ interval: null })
      const plan = nextSession(fit, FALLBACK)
      expect(plan).toMatchObject({ phase: 'coarse', reason: 'coarse', centre: fit.peak })
    })
  })

  describe('without an interior peak', () => {
    it('shifts the range up when the Score keeps climbing: the old top edge becomes the middle of the new range', () => {
      const fit = fitOf(coarse(5), 200)
      expect(fit).toMatchObject({ peak: null, reason: 'no-interior-peak' })
      const plan = nextSession(fit, FALLBACK)
      expect(plan).toMatchObject({ phase: 'coarse', reason: 'shift-higher', centre: fit.range!.max })
      expect(plan.levels).toHaveLength(7)
      expect(plan.levels[3]).toBeCloseTo(fit.range!.max, 9) // the old edge, the middle level
      expect(plan.levels[0]).toBeCloseTo(fit.range!.max / 2, 9)
      expect(plan.levels[6]).toBeCloseTo(fit.range!.max * 2, 9)
    })

    it('shifts the range down when the Score keeps falling', () => {
      const fit = fitOf(coarse(5), 8)
      const plan = nextSession(fit, FALLBACK)
      expect(plan).toMatchObject({ phase: 'coarse', reason: 'shift-lower', centre: fit.range!.min })
      expect(plan.levels[3]).toBeCloseTo(fit.range!.min, 9)
    })

    it('ignores the player Sensitivity: the shift comes from the data alone', () => {
      const fit = fitOf(coarse(5), 200)
      expect(nextSession(fit, 5)).toEqual(nextSession(fit, 500))
    })

    it('finds a far-off optimum in a few Sessions by following its own advice, with no state but the Runs', () => {
      for (const optimum of [150, 11]) {
        const player = syntheticPlayer({ optimum, noise: 0.1 })
        const sessions: SyntheticSession[] = coarse(3)
        const phases: string[] = []
        let fit = fitFinder(syntheticRuns(player, sessions, 7), { weights: WEIGHTS })
        for (let i = 0; i < 12 && !(fit.interval && fit.interval.halfWidth < 0.25); i++) {
          const plan = nextSession(fit, FALLBACK)
          phases.push(plan.reason)
          sessions.push({ levels: plan.levels })
          fit = fitFinder(syntheticRuns(player, sessions, 7), { weights: WEIGHTS })
        }
        expect(phases[0], `optimum ${optimum}`).toMatch(/^shift-/)
        expect(fit.peak, `optimum ${optimum}`).not.toBeNull()
        expect(Math.abs(fit.peak! / optimum - 1), `optimum ${optimum}`).toBeLessThan(0.15)
        expect(fit.interval!.halfWidth).toBeLessThan(0.25)
        expect(nextSession(fit, FALLBACK).phase).toBe('fine')
      }
    })
  })

  it('is deterministic, whatever order the Runs arrive in', () => {
    const runs = syntheticRuns(syntheticPlayer({ optimum: 33 }), coarse(6), 4)
    const plan = nextSession(fitFinder(runs, { weights: WEIGHTS }), FALLBACK)
    expect(nextSession(fitFinder(runs, { weights: WEIGHTS }), FALLBACK)).toEqual(plan)
    expect(nextSession(fitFinder([...runs].reverse(), { weights: WEIGHTS }), FALLBACK)).toEqual(plan)
  })
})
