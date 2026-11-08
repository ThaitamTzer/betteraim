import { describe, expect, it } from 'vitest'
import { cm360For, coarseLevels, fitFinder } from '../core'
import { syntheticPlayer, syntheticRuns } from '../core/testing/synthetic'
import { chartRows, resultView } from './finder-result'

const WEIGHTS = { clicking: 0.7, tracking: 0.3 }
const fitOf = (sessions: number, optimum = 33, seed = 1) =>
  fitFinder(syntheticRuns(syntheticPlayer({ optimum }), Array.from({ length: sessions }, () => ({ levels: coarseLevels(40) })), seed), { weights: WEIGHTS })

describe('the Finder result text', () => {
  it('gives the Recommended Sensitivity as cm/360, Game Sensitivity and eDPI by formula', () => {
    // Valorant 0.4 at 800 DPI is 320 eDPI, the Converter's reference point
    const fit = { ...fitOf(8), peak: cm360For('valorant', 0.4, 800) }
    const { recommended } = resultView(fit, 'valorant', 800)
    expect(recommended).toEqual({ cm360: fit.peak, gameSensitivity: expect.closeTo(0.4, 9), eDpi: expect.closeTo(320, 6) })
  })

  it('says there is enough data once the interval is narrower than +-10%, and shows progress before', () => {
    const late = fitOf(30)
    expect(resultView(late, 'valorant', 800)).toMatchObject({ enough: true, message: expect.stringMatching(/^Enough data.*within ±\d+\.\d%/) })
    const early = resultView(fitOf(4), 'valorant', 800)
    expect(early.enough).toBe(false)
    expect(early.message).toMatch(/^4 Sessions so far\. The interval is ±\d+\.\d% wide/)
    expect(early.message).not.toMatch(/Enough data/)
  })

  it('never rounds an interval onto the +-10% line it is judged by', () => {
    const base = fitOf(8)
    const withHalfWidth = (halfWidth: number, enoughData: boolean) => resultView({ ...base, enoughData, interval: { low: 30, high: 36, halfWidth } }, 'valorant', 800).message
    expect(withHalfWidth(0.1041, false)).toContain('±10.4% wide')
    expect(withHalfWidth(0.0996, true)).toContain('within ±9.9%')
  })

  it('asks for another Session when one cannot give an interval', () => {
    expect(resultView(fitOf(1), 'valorant', 800).message).toBe('1 Session so far. Play at least one more Session to get a confidence interval.')
  })

  it('is honest when there is no peak: out of range, and nothing played', () => {
    const outside = resultView(fitOf(5, 120), 'valorant', 800)
    expect(outside.recommended).toBeNull()
    expect(outside.message).toMatch(/no Curve Peak yet.*higher cm\/360 end/)
    expect(resultView(fitOf(5, 12), 'valorant', 800).message).toMatch(/lower cm\/360 end/)
    const none = resultView(fitFinder([], { weights: WEIGHTS }), 'valorant', 800)
    expect(none.recommended).toBeNull()
    expect(none.message).toMatch(/not played the Sensitivity Finder/)
  })

  it('carries the Game Profile note for typing the number in', () => {
    expect(resultView(fitOf(8), 'r6', 800).note).toMatch(/whole numbers/)
    expect(resultView(fitOf(8), 'valorant', 800).note).toBeUndefined()
  })
})

describe('the chart rows', () => {
  it('put the curve and the played levels on one strictly ascending x', () => {
    const fit = fitOf(6)
    const { x, curve, points } = chartRows(fit)
    expect(x.every((v, i) => i === 0 || v > x[i - 1]!)).toBe(true)
    expect(curve.filter((v) => v !== null)).toEqual(fit.curve.score)
    expect(points.filter((v) => v !== null)).toHaveLength(7) // the 7 coarse levels, on grid points
    expect(x).toHaveLength(fit.curve.sensitivity.length)
  })

  it('adds a played level that is between grid points, without a duplicate x for one on it', () => {
    const runs = syntheticRuns(syntheticPlayer({ optimum: 33 }), [...Array.from({ length: 4 }, () => ({ levels: coarseLevels(40) })), { levels: [33, 35, 37, 39, 41] }], 3)
    const fit = fitFinder(runs, { weights: WEIGHTS })
    const { x, points } = chartRows(fit)
    expect(x.length).toBeGreaterThan(fit.curve.sensitivity.length)
    expect(x.every((v, i) => i === 0 || v > x[i - 1]!)).toBe(true)
    expect(points.filter((v) => v !== null)).toHaveLength(fit.points.length)
  })
})
