import { describe, expect, it } from 'vitest'
import { cm360For, coarseLevels, fitCategories, fitFinder, nextSession } from '../core'
import { syntheticPlayer, syntheticRuns } from '../core/testing/synthetic'
import { categoriesView, categoryRows, chartRows, nextView, resultView } from './finder-result'
import { fmt } from './format'

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

  it('gives the AI Coach choice instead of the Curve Peak when it is inside the interval: Game Sensitivity and eDPI by formula from its cm/360', () => {
    const fit = { ...fitOf(8, 40.8), interval: { low: 36, high: 46, halfWidth: 0.12 } }
    // Valorant 0.4 at 800 DPI is about 40.8 cm/360 and 320 eDPI (the Converter's reference point)
    const view = resultView(fit, 'valorant', 800, { source: 'coach', recommended: 40.8 })
    expect(view.source).toBe('coach')
    expect(view.recommended).toEqual({ cm360: 40.8, gameSensitivity: expect.closeTo(0.4, 2), eDpi: expect.closeTo(320, 0) })
  })

  it('keeps the Curve Peak when the AI Coach choice is outside the interval or the AI Coach did not choose', () => {
    const fit = { ...fitOf(8, 40.8), interval: { low: 36, high: 46, halfWidth: 0.12 } }
    for (const coach of [{ source: 'coach' as const, recommended: fit.interval!.high * 1.2 }, { source: 'curve-peak' as const, recommended: 40.8 }, null, undefined]) {
      const view = resultView(fit, 'valorant', 800, coach)
      expect(view.source).toBe('curve-peak')
      expect(view.recommended!.cm360).toBe(fit.peak)
    }
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

  it('says the best Sensitivity seems to lie outside the tested range, on which side, and never offers the edge of the range', () => {
    const higher = fitOf(5, 120)
    const outside = resultView(higher, 'valorant', 800)
    expect(outside.recommended).toBeNull()
    expect(outside.message).toMatch(/outside the range you tested.*higher.*slower/)
    expect(outside.message).toMatch(/next Session shifts the range/)
    expect(outside.message).not.toContain(fmt(higher.range!.max)) // the edge is not a recommendation, so it is not even named
    const lower = resultView(fitOf(5, 12), 'valorant', 800)
    expect(lower.recommended).toBeNull()
    expect(lower.message).toMatch(/outside the range you tested.*lower.*faster/)
  })

  it('is honest when nothing was played, and when a Reset left nothing to fit', () => {
    const none = resultView(fitFinder([], { weights: WEIGHTS }), 'valorant', 800)
    expect(none.recommended).toBeNull()
    expect(none.message).toMatch(/not played the Sensitivity Finder/)
    const reset = resultView(fitFinder(syntheticRuns(syntheticPlayer(), [{ levels: coarseLevels(40) }], 1), { weights: WEIGHTS, exclude: () => true }), 'valorant', 800)
    expect(reset.recommended).toBeNull()
    expect(reset.message).toMatch(/reset.*kept for Analysis.*Play a Session/i)
    expect(reset.message).not.toMatch(/not played/)
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

describe('what the next Session will do', () => {
  const next = (fit: ReturnType<typeof fitOf>) => nextSession(fit, 40)

  it('says so for each phase, without printing a Sensitivity', () => {
    const start = nextView(next(fitFinder([], { weights: WEIGHTS })))
    expect(start).toMatch(/^coarse phase.*7 Sensitivities/)
    const wide = next(fitOf(2))
    expect(wide.reason).toBe('coarse')
    expect(nextView(wide)).toMatch(/coarse phase again.*narrower than ±25%/)
    const fine = next(fitOf(8))
    expect(fine.reason).toBe('fine')
    expect(nextView(fine)).toBe('fine phase, 5 Sensitivities within ±20% around your Curve Peak.')
    const up = next(fitOf(5, 120))
    expect(nextView(up)).toMatch(/shifting the range towards the slower edge.*higher cm\/360/)
    expect(nextView(next(fitOf(5, 12)))).toMatch(/shifting the range towards the faster edge.*lower cm\/360/)
    for (const plan of [wide, fine, up]) for (const level of plan.levels) expect(nextView(plan)).not.toContain(fmt(level)) // the levels of a Session stay hidden
  })
})

describe('the Clicking and Tracking curves', () => {
  const disagree = syntheticPlayer({
    noise: 0.1,
    scenarios: { ...syntheticPlayer().scenarios, flick: { level: 60, scale: 20, optimum: 30 }, strafe: { level: 55, scale: 12, optimum: 70 } },
  })
  const categories = (player: ReturnType<typeof syntheticPlayer>, sessions = 10) =>
    fitCategories(syntheticRuns(player, Array.from({ length: sessions }, () => ({ levels: coarseLevels(40) })), 3), { weights: WEIGHTS })

  it('says plainly when the two peaks differ noticeably, because their intervals do not overlap', () => {
    const view = categoriesView(categories(disagree))
    expect(view.categories.map((c) => c.label)).toEqual(['Clicking', 'Tracking'])
    expect(view.categories[0]!.message).toMatch(/^Clicking: peak [23]\d(\.\d+)? cm\/360, interval/)
    expect(view.categories[1]!.message).toMatch(/^Tracking: peak [67]\d(\.\d+)? cm\/360, interval/)
    expect(view.difference).toMatch(/differ noticeably/)
  })

  it('does not claim a difference when both favour the same Sensitivity', () => {
    const same = categoriesView(categories(syntheticPlayer({ optimum: 40, noise: 0.1 })))
    expect(same.categories.every((c) => c.message.includes('peak'))).toBe(true)
    expect(same.difference).toMatch(/agree|do not favour clearly different/)
    expect(same.difference).not.toMatch(/differ noticeably/)
  })

  it('says when a category has too little data, and makes no comparison', () => {
    const clickingOnly = fitCategories(
      syntheticRuns(syntheticPlayer({ optimum: 40, noise: 0.1 }), Array.from({ length: 4 }, () => ({ levels: coarseLevels(40) })), 2).filter((r) => r.scenario === 'flick'),
      { weights: WEIGHTS },
    )
    const view = categoriesView(clickingOnly)
    expect(view.categories[0]!.message).toMatch(/^Clicking: peak/)
    expect(view.categories[1]!.message).toMatch(/^Tracking: not enough finished data for a curve yet/)
    expect(view.difference).toBeNull()
  })

  it('says when a category has no peak inside the tested range', () => {
    const view = categoriesView(categories(syntheticPlayer({ optimum: 40, noise: 0.05, scenarios: { ...syntheticPlayer().scenarios, strafe: { level: 55, scale: 12, optimum: 300 } } }), 6))
    expect(view.categories[1]!.message).toMatch(/^Tracking: no peak inside the tested range yet.*higher cm\/360/)
    expect(view.difference).toBeNull()
  })

  it('go on one chart: shared ascending x, each curve where it exists, a marker per peak', () => {
    const fits = categories(disagree)
    const chart = categoryRows(fits)
    expect(chart.x.every((v, i) => i === 0 || v > chart.x[i - 1]!)).toBe(true)
    expect(chart.clicking.filter((v) => v !== null)).toEqual(fits.clicking.curve.score)
    expect(chart.tracking.filter((v) => v !== null)).toEqual(fits.tracking.curve.score)
    expect(chart.markers).toEqual([
      { x: fits.clicking.peak, label: 'Clicking peak' },
      { x: fits.tracking.peak, label: 'Tracking peak' },
    ])
  })

  it('leave out the curve and marker of a category that has none', () => {
    const chart = categoryRows(fitCategories([], { weights: WEIGHTS }))
    expect(chart).toEqual({ x: [], clicking: [], tracking: [], markers: [] })
  })
})
