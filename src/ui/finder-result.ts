import { ENOUGH_HALF_WIDTH, eDpi, FINE_HALF_WIDTH, FINE_SPREAD, gameSensitivityFor, getGameProfile, recommend } from '../core'
import type { FinderFit, GameProfileId, NextSession, Recommendation, ScenarioCategory } from '../core'
import { fmt } from './format'

export interface ResultView {
  /** The Recommended Sensitivity in the three forms a player types somewhere. Game Sensitivity and eDPI are always by formula from cm/360. */
  recommended: { cm360: number; gameSensitivity: number; eDpi: number } | null
  /** Who chose `recommended`: the AI Coach (inside the interval), or the Curve Peak itself. */
  source: 'coach' | 'curve-peak'
  /** The Game Profile's remark about typing its Game Sensitivity (a menu value, whole numbers only, ...). */
  note: string | undefined
  /** The interval is narrower than ±10%. */
  enough: boolean
  /** How sure the result is, or why there is none. */
  message: string
}

const sessions = (n: number): string => `${n} Session${n === 1 ? '' : 's'}`
// One decimal, rounded down: 0.0996 is "9.9%", never "10%" next to a claim that the interval is narrower than 10%.
const percent = (halfWidth: number): string => `${(Math.floor(halfWidth * 1000) / 10).toFixed(1)}%`

/**
 * What the result screen says about a fit, for one Game Profile at the player's DPI. Pure: no Run's Sensitivity but the curve's own is in it.
 * `coach` is the AI Coach's answer when there is one (see `recommendSensitivity`); one outside the interval is ignored.
 */
export function resultView(fit: FinderFit, gameProfileId: GameProfileId, dpi: number, coach?: Pick<Recommendation, 'source' | 'recommended'> | null): ResultView {
  const cm360 = recommend(fit, coach)
  const profile = getGameProfile(gameProfileId)
  const gameSensitivity = cm360 === null ? null : gameSensitivityFor(gameProfileId, cm360, dpi)
  const recommended = cm360 === null || gameSensitivity === null ? null : { cm360, gameSensitivity, eDpi: eDpi(gameSensitivity, dpi) }
  const { interval, counts } = fit
  const limit = `${Math.round(ENOUGH_HALF_WIDTH * 100)}%`
  const message = ((): string => {
    if (fit.reason === 'no-interior-peak') {
      // The edge of the range is never offered as a Recommended Sensitivity, so no number is named here.
      const side = fit.curve.score.at(-1)! >= fit.curve.score[0]! ? 'higher (slower)' : 'lower (faster)'
      return `Your best Sensitivity seems to lie outside the range you tested, towards a ${side} cm/360. There is no Curve Peak yet, so no Sensitivity is recommended. The next Session shifts the range that way.`
    }
    if (fit.reason === 'insufficient-data') {
      const { warmup, practice, filtered, incompletePair } = counts.excluded
      if (counts.runs === 0 && warmup + practice + filtered + incompletePair === 0) {
        return 'You have not played the Sensitivity Finder for this game yet. Play a Session and the curve starts to take shape.'
      }
      if (counts.runs === 0 && filtered > 0 && incompletePair === 0) {
        return 'You reset the Finder for this game, so your earlier Runs no longer count. They are kept for Analysis, History and Past Runs. Play a Session to start a new curve.'
      }
      return 'There is not enough finished data to draw a curve yet. A Scenario counts once you have played it at every level of a Session, so finish your Sessions.'
    }
    if (!interval) return `${sessions(counts.sessions)} so far. Play at least one more Session to get a confidence interval.`
    const edge = fit.range && (interval.low <= fit.range.min || interval.high >= fit.range.max)
    if (edge) return `${sessions(counts.sessions)} so far. The interval (�${percent(interval.halfWidth)}) reaches the edge of the range you tested, so your Curve Peak is not pinned down yet; there is enough data once it is narrower than �${limit} and inside the tested range.`
    return fit.enoughData
      ? `Enough data: your Curve Peak is known to within ±${percent(interval.halfWidth)}. You can stop here, or keep playing Sessions to narrow it further.`
      : `${sessions(counts.sessions)} so far. The interval is ±${percent(interval.halfWidth)} wide; there is enough data once it is narrower than ±${limit}.`
  })()
  const source = recommended !== null && coach?.source === 'coach' && cm360 === coach.recommended ? 'coach' : 'curve-peak'
  return { recommended, source, note: profile.note, enough: fit.enoughData, message }
}

/**
 * The curve and the played levels on one shared x for the chart: the curve's log grid plus each tested Sensitivity that is not on it
 * (`exp(ln x)` is not bit-exact, so a level within 1e-9 of a grid point is the grid point).
 */
export function chartRows(fit: FinderFit): { x: number[]; curve: (number | null)[]; points: (number | null)[] } {
  const { sensitivity, score } = fit.curve
  const near = (a: number, b: number): boolean => Math.abs(a / b - 1) < 1e-9
  const rows = sensitivity.map((x, i) => ({ x, curve: score[i]! as number | null, point: null as number | null }))
  for (const p of fit.points) {
    const row = rows.find((r) => near(r.x, p.sensitivity))
    if (row) row.point = p.score
    else rows.push({ x: p.sensitivity, curve: null, point: p.score })
  }
  rows.sort((a, b) => a.x - b.x)
  return { x: rows.map((r) => r.x), curve: rows.map((r) => r.curve), points: rows.map((r) => r.point) }
}

// --- Finder phases and per-category curves (#11) ---

const percentOf = (share: number): string => `±${Math.round(share * 100)}%`

/** What a Session will do, in words ("Next Session: " or "This Session: " goes in front). Says nothing about which Sensitivities: those stay hidden until the Session is over. */
export function nextView(next: NextSession): string {
  switch (next.reason) {
    case 'start':
      return 'coarse phase, 7 Sensitivities from half to double your current one.'
    case 'coarse':
      return `coarse phase again, 7 Sensitivities from half to double around your Curve Peak, until the interval is narrower than ${percentOf(FINE_HALF_WIDTH)}.`
    case 'fine':
      return `fine phase, 5 Sensitivities within ${percentOf(FINE_SPREAD)} around your Curve Peak.`
    case 'shift-higher':
      return 'still coarse, shifting the range towards the slower edge (higher cm/360).'
    case 'shift-lower':
      return 'still coarse, shifting the range towards the faster edge (lower cm/360).'
  }
}

export interface CategoriesView {
  categories: { label: 'Clicking' | 'Tracking'; message: string }[]
  /** Whether the two peaks differ noticeably, said plainly; null when it cannot be told (a category has no peak or no interval). */
  difference: string | null
}

const CATEGORY_LABEL: Record<ScenarioCategory, 'Clicking' | 'Tracking'> = { clicking: 'Clicking', tracking: 'Tracking' }

/**
 * One line per category (its peak and interval, or why it has none) and whether the two peaks differ noticeably. "Noticeably" is that the
 * two intervals do not overlap: each category is fitted on its own, so peaks that are closer than that are within what a few Sessions of noise do.
 */
export function categoriesView(fits: Record<ScenarioCategory, FinderFit>): CategoriesView {
  const categories = (['clicking', 'tracking'] as const).map((category) => {
    const fit = fits[category]
    const label = CATEGORY_LABEL[category]
    const message = ((): string => {
      if (fit.peak !== null) {
        return fit.interval
          ? `${label}: peak ${fmt(fit.peak)} cm/360, interval ${fmt(fit.interval.low)} to ${fmt(fit.interval.high)} cm/360.`
          : `${label}: peak ${fmt(fit.peak)} cm/360, no interval yet (it needs more Sessions with a ${label} Scenario).`
      }
      if (fit.reason === 'no-interior-peak') {
        const side = fit.curve.score.at(-1)! >= fit.curve.score[0]! ? 'higher' : 'lower'
        return `${label}: no peak inside the tested range yet, the curve is still climbing towards ${side} cm/360.`
      }
      return `${label}: not enough finished data for a curve yet. A Scenario counts once you have played it at every level of a Session.`
    })()
    return { label, message }
  })
  const { clicking, tracking } = fits
  if (clicking.peak === null || tracking.peak === null || !clicking.interval || !tracking.interval) return { categories, difference: null }
  const apart = clicking.interval.high < tracking.interval.low || tracking.interval.high < clicking.interval.low
  return {
    categories,
    difference: apart
      ? `The two peaks differ noticeably: Clicking at ${fmt(clicking.peak)} cm/360 and Tracking at ${fmt(tracking.peak)} cm/360, and their intervals do not overlap. The combined curve weighs them by how your game is played.`
      : 'The two peaks agree within their intervals: Clicking and Tracking do not favour clearly different Sensitivities (yet).',
  }
}

/** Both category curves on one shared ascending x for the chart (each is null where it has no point), with a marker at each peak. */
export function categoryRows(fits: Record<ScenarioCategory, FinderFit>): {
  x: number[]
  clicking: (number | null)[]
  tracking: (number | null)[]
  markers: { x: number; label: string }[]
} {
  const x = [...new Set([...fits.clicking.curve.sensitivity, ...fits.tracking.curve.sensitivity])].sort((a, b) => a - b)
  const column = ({ curve }: FinderFit): (number | null)[] => {
    const at = new Map(curve.sensitivity.map((s, i) => [s, curve.score[i]!]))
    return x.map((s) => at.get(s) ?? null)
  }
  const markers = (['clicking', 'tracking'] as const).flatMap((c) => {
    const peak = fits[c].peak
    return peak === null ? [] : [{ x: peak, label: `${CATEGORY_LABEL[c]} peak` }]
  })
  return { x, clicking: column(fits.clicking), tracking: column(fits.tracking), markers }
}
