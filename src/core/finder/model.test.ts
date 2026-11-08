import { describe, expect, it } from 'vitest'
import { coarseLevels } from '../index'
import type { RunSummary } from '../index'
import { fitFinder, recommend } from './model'
import { referencePeak } from '../testing/reference-fit'
import { syntheticPlayer, syntheticRuns } from '../testing/synthetic'
import type { SyntheticSession } from '../testing/synthetic'

const WEIGHTS = { clicking: 0.7, tracking: 0.3 }
const coarse = (n: number, centre = 40): SyntheticSession[] => Array.from({ length: n }, () => ({ levels: coarseLevels(centre) }))
const fine = (n: number, centre: number): SyntheticSession[] => Array.from({ length: n }, () => ({ levels: [0.8, 0.9, 1, 1.1, 1.2].map((f) => centre * f) }))
const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('the Curve Peak', () => {
  it('recovers the true optimum of a noise-free player despite learning and a different form every Session', () => {
    const player = syntheticPlayer({ optimum: 33, noise: 0 })
    const fit = fitFinder(syntheticRuns(player, coarse(6), 1), { weights: WEIGHTS })
    expect(fit.reason).toBeNull()
    expect(fit.peak).toBeCloseTo(33, 0) // within 0.5 cm/360 (1.5%): the model scales each Scenario by one spread, which is not the generator's own
  })

  it('is what the spec model gives, checked against a brute-force fit with explicit dummies and weights', () => {
    for (const seed of seeds(5)) {
      const runs = syntheticRuns(syntheticPlayer({ optimum: 33 }), [...coarse(4), ...fine(3, 45)], seed)
      expect(fitFinder(runs, { weights: WEIGHTS }).peak).toBeCloseTo(referencePeak(runs, WEIGHTS), 6)
    }
  })

  it('removes a strong learning trend through the run-order term', () => {
    const player = syntheticPlayer({ optimum: 33, noise: 0.05, trend: 0.05 })
    for (const seed of seeds(5)) {
      const fit = fitFinder(syntheticRuns(player, coarse(6), seed), { weights: WEIGHTS })
      expect(Math.abs(fit.peak! - 33) / 33, `seed ${seed}`).toBeLessThan(0.04)
      expect(fit.coefficients!.order).toBeGreaterThan(0.01) // the Score rises over the Session
    }
  })

  it('is the top of the curve it reports, and the curve spans the tested range on a log grid', () => {
    const fit = fitFinder(syntheticRuns(syntheticPlayer({ optimum: 33 }), coarse(6), 2), { weights: WEIGHTS })
    const { sensitivity, score } = fit.curve
    expect(Math.max(...score)).toBe(0)
    expect(sensitivity[score.indexOf(0)]!).toBeCloseTo(fit.peak!, -0.5) // within one grid step
    expect(sensitivity[0]).toBeCloseTo(20, 6)
    expect(sensitivity.at(-1)).toBeCloseTo(80, 6)
    expect(fit.range).toEqual({ min: expect.closeTo(20, 6), max: expect.closeTo(80, 6) })
    const ratios = sensitivity.slice(1).map((s, i) => s / sensitivity[i]!)
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1e-9)
    expect(fit.points.map((p) => p.sensitivity)).toEqual(coarseLevels(40).map((c) => expect.closeTo(c, 6)))
  })

  it('is what recommend returns until the AI Coach chooses', () => {
    const fit = fitFinder(syntheticRuns(syntheticPlayer(), coarse(4), 1), { weights: WEIGHTS })
    expect(recommend(fit)).toBe(fit.peak)
  })
})

describe('the confidence interval', () => {
  const player = syntheticPlayer({ optimum: 33 })
  const run = (n: number, seed: number) => fitFinder(syntheticRuns(player, coarse(n), seed), { weights: WEIGHTS })

  it('is a central 90% bootstrap interval that holds the peak and covers the true optimum about nine times in ten', () => {
    for (const sessions of [5, 8]) {
      const fits = seeds(100).map((seed) => run(sessions, seed))
      expect(fits.every((f) => f.interval && f.interval.low <= f.peak! && f.peak! <= f.interval.high)).toBe(true)
      const covered = fits.filter((f) => f.interval && f.interval.low <= 33 && 33 <= f.interval.high).length / fits.length
      // Nominal 0.90, measured 0.88 to 0.89 over these seeds (0.73 at 5 Sessions without the small-sample stretch). Not 1: it is statistical.
      expect(covered, `${sessions} Sessions`).toBeGreaterThanOrEqual(0.83)
      expect(covered, `${sessions} Sessions`).toBeLessThanOrEqual(0.97)
    }
  })

  it('states its half-width relative to the peak', () => {
    const { peak, interval } = run(8, 3)
    expect(interval!.halfWidth).toBeCloseTo((interval!.high - interval!.low) / 2 / peak!, 12)
  })

  it('narrows with more data', () => {
    const width = (n: number) => mean(seeds(12).map((seed) => run(n, seed).interval!.halfWidth))
    const [few, some, many] = [width(3), width(8), width(24)]
    expect(few).toBeGreaterThan(some)
    expect(some).toBeGreaterThan(many)
  })

  it('reports enough data once it is narrower than +-10%, not before', () => {
    const early = run(3, 4)
    expect(early.interval!.halfWidth).toBeGreaterThan(0.1)
    expect(early.enoughData).toBe(false)
    const late = run(30, 4)
    expect(late.interval!.halfWidth).toBeLessThan(0.1)
    expect(late.enoughData).toBe(true)
  })

  describe('near the edge of the tested range', () => {
    // coarseLevels(40) tests 20 to 80 cm/360.
    it('is never enough data for an optimum just beyond the range, however many Sessions (it used to be, from a collapsed clamped interval)', () => {
      const fits = seeds(40).map((seed) => fitFinder(syntheticRuns(syntheticPlayer({ optimum: 18 }), coarse(16), seed), { weights: WEIGHTS }))
      expect(fits.filter((f) => f.interval !== null).length, 'some fits find an interior peak').toBeGreaterThan(3)
      expect(fits.filter((f) => f.enoughData)).toHaveLength(0)
    })

    it('reports an interval that reaches the edge of the tested range as it is, not cut at the edge, and not enough data', () => {
      const fits = seeds(40).map((seed) => fitFinder(syntheticRuns(syntheticPlayer({ optimum: 20 }), coarse(16), seed), { weights: WEIGHTS }))
      const reaching = fits.filter((f) => f.interval && f.interval.low <= f.range!.min)
      expect(reaching.length).toBeGreaterThan(5)
      expect(reaching.some((f) => f.interval!.low < f.range!.min)).toBe(true)
      expect(reaching.filter((f) => f.enoughData)).toHaveLength(0)
    })

    it('says enough data only for an interval strictly inside the tested range', () => {
      for (const optimum of [18, 22, 26, 33, 50, 70]) {
        for (const seed of seeds(6)) {
          const f = fitFinder(syntheticRuns(syntheticPlayer({ optimum }), coarse(24), seed), { weights: WEIGHTS })
          if (f.enoughData) {
            expect(f.interval!.low, `optimum ${optimum}`).toBeGreaterThan(f.range!.min)
            expect(f.interval!.high, `optimum ${optimum}`).toBeLessThan(f.range!.max)
            expect(f.interval!.halfWidth).toBeLessThan(0.1)
          }
        }
      }
    })

    it('still says enough data in the middle of the range, so the rule is not simply "never"', () => {
      const f = fitFinder(syntheticRuns(syntheticPlayer({ optimum: 40 }), coarse(30), 4), { weights: WEIGHTS })
      expect(f.enoughData).toBe(true)
    })
  })

  it('is the same for the same data, whatever the order the Runs arrive in', () => {
    const runs = syntheticRuns(player, coarse(6), 7)
    const once = fitFinder(runs, { weights: WEIGHTS })
    expect(fitFinder([...runs], { weights: WEIGHTS })).toEqual(once)
    expect(fitFinder([...runs].reverse(), { weights: WEIGHTS })).toEqual(once)
  })

  it('does not exist after a single Session, which has nothing to resample', () => {
    const fit = run(1, 1)
    expect(fit.peak).not.toBeNull()
    expect(fit.interval).toBeNull()
    expect(fit.enoughData).toBe(false)
    expect(fit.counts.sessions).toBe(1)
  })

  it('stays well under a second for ten Sessions', () => {
    const runs = syntheticRuns(player, coarse(10), 1)
    const started = performance.now()
    fitFinder(runs, { weights: WEIGHTS })
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('pooling coarse and fine Sessions', () => {
  // The fine Sessions are all centred above the true optimum (33), so their levels sit on one flank of the curve.
  it('still lands on the true optimum for a noise-free player, which subtracting pair means would not', () => {
    const sessions = [...coarse(6), ...fine(6, 45)]
    const clean = syntheticRuns(syntheticPlayer({ optimum: 33, noise: 0, trend: 0, form: 0 }), sessions, 1)
    expect(fitFinder(clean, { weights: WEIGHTS }).peak).toBeCloseTo(33, 1)
    // the control: the same data with each pair's mean subtracted first (independent code, see testing/reference-fit.ts) is off by about 6%
    expect(Math.abs(referencePeak(clean, WEIGHTS, true) - 33) / 33).toBeGreaterThan(0.05)
    // a different form in every pair changes nothing: the offsets take it out exactly
    const moody = syntheticRuns(syntheticPlayer({ optimum: 33, noise: 0, trend: 0, form: 0.3 }), sessions, 1)
    expect(fitFinder(moody, { weights: WEIGHTS }).peak).toBeCloseTo(33, 1)
  })

  it('stays on it, within the interval, for a noisy player', () => {
    const player = syntheticPlayer({ optimum: 33, noise: 0.1, trend: 0 })
    const fits = seeds(10).map((seed) => fitFinder(syntheticRuns(player, [...coarse(4), ...fine(10, 50)], seed), { weights: WEIGHTS }))
    expect(Math.max(...fits.map((f) => Math.abs(f.peak! - 33) / 33))).toBeLessThan(0.05)
    expect(fits.filter((f) => f.interval!.low <= 33 && 33 <= f.interval!.high).length).toBeGreaterThanOrEqual(8)
  })
})

describe('category weighting', () => {
  // The Clicking optimum is the coarse level at k = -1 and the Tracking one at k = +1, so both Scenarios see the same curve
  // shape on the same levels and the pooled peak is exactly the share-weighted mean of the two optima in ln(Sensitivity).
  const clickingBest = 40 * 2 ** (-1 / 3)
  const trackingBest = 40 * 2 ** (1 / 3)
  const player = syntheticPlayer({
    noise: 0,
    trend: 0,
    form: 0,
    scenarios: { ...syntheticPlayer().scenarios, flick: { baseline: 60, scale: 20, optimum: clickingBest }, strafe: { baseline: 55, scale: 12, optimum: trackingBest } },
  })
  const onlyClicking: SyntheticSession = { levels: coarseLevels(40), scenarios: ['flick'] }
  const onlyTracking: SyntheticSession = { levels: coarseLevels(40), scenarios: ['strafe'] }
  const mix = (clicking: number, tracking: number) => [...Array(clicking).fill(onlyClicking), ...Array(tracking).fill(onlyTracking)] as SyntheticSession[]
  const target = (clicking: number) => Math.exp(clicking * Math.log(clickingBest) + (1 - clicking) * Math.log(trackingBest))

  it('weights data drawn exactly at the target shares by those shares, as an unweighted fit would', () => {
    const runs = syntheticRuns(player, mix(7, 3), 1)
    const fit = fitFinder(runs, { weights: WEIGHTS })
    expect(fit.peak).toBeCloseTo(target(0.7), 0) // 36.47, to 0.5; counting the shares twice (84/16) would give 34.2
    // 49 of 70 Runs are Clicking, so the brute-force fit gives every Run weight 0.7 / 0.7 = 0.3 / 0.3 = 1: it is the unweighted fit
    expect(fit.peak).toBeCloseTo(referencePeak(runs, WEIGHTS), 6)
  })

  it('corrects skewed shares back to the target shares', () => {
    expect(fitFinder(syntheticRuns(player, mix(17, 3), 1), { weights: WEIGHTS }).peak).toBeCloseTo(target(0.7), 0) // 85/15 of the Runs, 70/30 of the weight (uncorrected: 34.0)
    expect(fitFinder(syntheticRuns(player, mix(3, 7), 1), { weights: WEIGHTS }).peak).toBeCloseTo(target(0.7), 0) // (uncorrected: 43.9)
  })

  it('follows the Game Profile, not the data', () => {
    expect(fitFinder(syntheticRuns(player, mix(7, 3), 1), { weights: { clicking: 0.3, tracking: 0.7 } }).peak).toBeCloseTo(target(0.3), 0)
  })

  it('fits one category on its own without any weighting', () => {
    const clicking = syntheticRuns(player, mix(5, 0), 1)
    expect(fitFinder(clicking, { weights: WEIGHTS }).peak).toBeCloseTo(clickingBest, 3)
    expect(fitFinder(clicking, { weights: { clicking: 0.1, tracking: 0.9 } }).peak).toBeCloseTo(clickingBest, 3)
    expect(fitFinder(syntheticRuns(player, mix(0, 5), 1), { weights: WEIGHTS }).peak).toBeCloseTo(trackingBest, 3)
  })

  it('scales each Scenario by its own spread, so Scores in other units do not drown the rest', () => {
    const loud = syntheticPlayer({ ...player, scenarios: { ...player.scenarios, flick: { baseline: 60000, scale: 20000, optimum: clickingBest } } })
    const fit = fitFinder(syntheticRuns(loud, mix(5, 5), 1), { weights: { clicking: 0.5, tracking: 0.5 } })
    expect(fit.peak).toBeCloseTo(Math.exp((Math.log(clickingBest) + Math.log(trackingBest)) / 2), 0) // 40, the middle of the two (the loud Scenario alone: 31.7)
  })
})

describe('what the fit leaves out', () => {
  const player = syntheticPlayer({ optimum: 33 })
  const clean = syntheticRuns(player, coarse(6), 1).filter((r) => !r.warmup)
  const base = fitFinder(clean, { weights: WEIGHTS })
  /** The peak, the interval and the curve to 1e-9: a Run that is left out cannot move them (only a different float order may). */
  const sameFit = (a: ReturnType<typeof fitFinder>, b: ReturnType<typeof fitFinder>) => {
    expect(a.peak).toBeCloseTo(b.peak!, 9)
    expect(a.interval!.low).toBeCloseTo(b.interval!.low, 9)
    expect(a.interval!.high).toBeCloseTo(b.interval!.high, 9)
    a.curve.score.forEach((score, i) => expect(score).toBeCloseTo(b.curve.score[i]!, 9))
    expect(a.counts.runs).toBe(b.counts.runs)
  }

  it('drops Warm-up Runs', () => {
    const withWarmups = syntheticRuns(player, coarse(6), 1)
    expect(withWarmups.filter((r) => r.warmup)).toHaveLength(12)
    const fit = fitFinder(withWarmups, { weights: WEIGHTS })
    expect(fit.counts.excluded.warmup).toBe(12)
    sameFit(fit, base)
  })

  it('drops Practice Runs, even absurd ones', () => {
    const practice = Array.from({ length: 30 }, (_, i): RunSummary => ({ ...clean[i % clean.length]!, id: `practice-${i}`, mode: 'practice', sessionId: 'practice-1', sensitivity: i % 2 ? 5 : 500, score: i % 2 ? 900 : -400 }))
    const fit = fitFinder([...clean, ...practice], { weights: WEIGHTS })
    expect(fit.counts.excluded.practice).toBe(30)
    sameFit(fit, base)
  })

  it('drops (Session, Scenario) pairs with missing levels, keeping the Session\'s complete pairs', () => {
    // 5 of 14 counted Runs: neither pair can have all 7 levels. A different player, so that keeping it would move the peak.
    const abandoned = syntheticRuns(syntheticPlayer({ optimum: 70 }), [{ levels: coarseLevels(40), abandonAfter: 5 }], 99)
    expect(abandoned.filter((r) => !r.warmup)).toHaveLength(5)
    const fit = fitFinder([...clean, ...abandoned], { weights: WEIGHTS })
    expect(fit.counts.excluded.incompletePair).toBe(5)
    expect(fit.counts.sessions).toBe(6)
    sameFit(fit, base)

    // one pair complete, one not: the complete one stays
    const half = syntheticRuns(player, [{ levels: coarseLevels(40) }], 98).filter((r) => !r.warmup && r.scenario === 'flick').concat(
      syntheticRuns(player, [{ levels: coarseLevels(40) }], 98).filter((r) => !r.warmup && r.scenario === 'strafe').slice(0, 4),
    )
    const partial = fitFinder(half, { weights: WEIGHTS })
    expect(partial.counts).toMatchObject({ sessions: 1, pairs: 1, runs: 7 })
    expect(partial.counts.excluded.incompletePair).toBe(4)
  })

  it('drops what the exclusion hook names, and the pairs that leaves incomplete', () => {
    const runs = syntheticRuns(player, coarse(8), 5)
    const day = 86_400_000
    const resetAt = 3 * day - 1 // Sessions 3 to 7 are after the reset
    const after = fitFinder(runs.filter((r) => r.startedAt >= resetAt), { weights: WEIGHTS })
    const fit = fitFinder(runs, { weights: WEIGHTS, exclude: (r) => r.startedAt < resetAt })
    expect(fit.counts.sessions).toBe(5)
    expect(fit.peak).toBeCloseTo(after.peak!, 9)
    // a reset in the middle of a Session cuts it, so its pairs are left out
    const cut = fitFinder(runs, { weights: WEIGHTS, exclude: (r) => r.startedAt < 3 * day + 5 * 45_000 })
    expect(cut.counts.sessions).toBe(4)
    expect(cut.counts.excluded.incompletePair).toBeGreaterThan(0)
  })
})

describe('without a peak', () => {
  it('says there is no interior peak when the best Sensitivity lies beyond the tested range', () => {
    const fit = fitFinder(syntheticRuns(syntheticPlayer({ optimum: 120, noise: 0.05 }), coarse(5), 1), { weights: WEIGHTS })
    expect(fit.peak).toBeNull()
    expect(fit.reason).toBe('no-interior-peak')
    expect(fit.interval).toBeNull()
    expect(fit.enoughData).toBe(false)
    expect(fit.range!.max).toBeCloseTo(80, 6)
    expect(fit.curve.score.at(-1)).toBe(0) // the higher end of the curve is the side to move towards
    expect(fit.curve.score[0]).toBeLessThan(-0.5)
  })

  it('says so for the low side and for a curve that is a valley', () => {
    const low = fitFinder(syntheticRuns(syntheticPlayer({ optimum: 12, noise: 0.05 }), coarse(5), 1), { weights: WEIGHTS })
    expect(low).toMatchObject({ peak: null, reason: 'no-interior-peak' })
    expect(low.curve.score[0]).toBe(0)
    const valley = fitFinder(syntheticRuns(syntheticPlayer({ curvature: -0.8, noise: 0.05 }), coarse(5), 1), { weights: WEIGHTS })
    expect(valley).toMatchObject({ peak: null, reason: 'no-interior-peak' })
  })

  it('says there is too little data, without throwing, for nothing, Practice only, or an abandoned Session', () => {
    const none = fitFinder([], { weights: WEIGHTS })
    expect(none).toMatchObject({ peak: null, reason: 'insufficient-data', interval: null, enoughData: false, range: null })
    expect(none.curve).toEqual({ sensitivity: [], score: [] })
    const practice = syntheticRuns(syntheticPlayer(), coarse(2), 1).map((r): RunSummary => ({ ...r, mode: 'practice' }))
    expect(fitFinder(practice, { weights: WEIGHTS })).toMatchObject({ peak: null, reason: 'insufficient-data' })
    const abandoned = syntheticRuns(syntheticPlayer(), [{ levels: coarseLevels(40), abandonAfter: 6 }], 1)
    const fit = fitFinder(abandoned, { weights: WEIGHTS })
    expect(fit).toMatchObject({ peak: null, reason: 'insufficient-data', counts: { sessions: 0, runs: 0 } })
  })
})
