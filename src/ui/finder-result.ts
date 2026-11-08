import { ENOUGH_HALF_WIDTH, eDpi, gameSensitivityFor, getGameProfile, recommend } from '../core'
import type { FinderFit, GameProfileId } from '../core'

export interface ResultView {
  /** The Recommended Sensitivity in the three forms a player types somewhere. Game Sensitivity and eDPI are always by formula from cm/360. */
  recommended: { cm360: number; gameSensitivity: number; eDpi: number } | null
  /** The Game Profile's remark about typing its Game Sensitivity (a menu value, whole numbers only, ...). */
  note: string | undefined
  /** The interval is narrower than ±10%. */
  enough: boolean
  /** How sure the result is, or why there is none. */
  message: string
}

const sessions = (n: number): string => `${n} Session${n === 1 ? '' : 's'}`
const percent = (halfWidth: number): string => `${Math.round(halfWidth * 100)}%`

/** What the result screen says about a fit, for one Game Profile at the player's DPI. Pure: no Run's Sensitivity but the curve's own is in it. */
export function resultView(fit: FinderFit, gameProfileId: GameProfileId, dpi: number): ResultView {
  const cm360 = recommend(fit)
  const profile = getGameProfile(gameProfileId)
  const gameSensitivity = cm360 === null ? null : gameSensitivityFor(gameProfileId, cm360, dpi)
  const recommended = cm360 === null || gameSensitivity === null ? null : { cm360, gameSensitivity, eDpi: eDpi(gameSensitivity, dpi) }
  const { interval, counts } = fit
  const limit = percent(ENOUGH_HALF_WIDTH)
  const message = ((): string => {
    if (fit.reason === 'no-interior-peak') {
      const side = fit.curve.score.at(-1)! >= fit.curve.score[0]! ? 'higher' : 'lower'
      return `There is no Curve Peak yet: the curve is still climbing towards the ${side} cm/360 end of what you tested, so your best Sensitivity may lie outside that range. Another Session will tell more.`
    }
    if (fit.reason === 'insufficient-data') {
      const left = counts.excluded.warmup + counts.excluded.practice + counts.excluded.filtered + counts.excluded.incompletePair
      return counts.runs === 0 && left === 0
        ? 'You have not played the Sensitivity Finder for this game yet. Play a Session and the curve starts to take shape.'
        : 'There is not enough finished data to draw a curve yet. A Scenario counts once you have played it at every level of a Session, so finish your Sessions.'
    }
    if (!interval) return `${sessions(counts.sessions)} so far. Play at least one more Session to get a confidence interval.`
    return fit.enoughData
      ? `Enough data: your Curve Peak is known to within ±${percent(interval.halfWidth)}. You can stop here, or keep playing Sessions to narrow it further.`
      : `${sessions(counts.sessions)} so far. The interval is ±${percent(interval.halfWidth)} wide; there is enough data once it is narrower than ±${limit}.`
  })()
  return { recommended, note: profile.note, enough: fit.enoughData, message }
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
