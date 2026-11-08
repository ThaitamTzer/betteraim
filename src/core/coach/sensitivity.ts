import { groupRuns } from '../aggregate'
import type { AnalysedRun } from '../aggregate'
import { getGameProfile } from '../game-profiles'
import type { GameProfileId } from '../game-profiles'
import { hashRuns, INTERVAL_LEVEL } from '../finder/model'
import type { FinderFit } from '../finder/model'
import { getScenario } from '../scenarios'
import type { Cm360, ScenarioId } from '../types'
import { cleanLanguage, figuresOf } from './advice'
import { describePlayerContext, parsePlayerContext } from './context'
import type { PlayerContext } from './context'
import { askJson } from './json'
import { CoachError } from './provider'
import type { CoachProvider } from './provider'

/**
 * The AI Coach's Recommended Sensitivity (ADR-0003, ticket #15): it picks a cm/360 inside the Curve Peak's confidence interval.
 * Everything around the call lives here and is tested with a fake provider: the payload (aggregates only), the guardrail, the
 * fallback to the Curve Peak and the per-snapshot cache. Game Sensitivity and eDPI are never asked: the caller works them out from the
 * cm/360 (`gameSensitivityFor`, `eDpi`).
 */

export interface Recommendation {
  /** cm/360; null only when there is no Curve Peak and so nothing to recommend. */
  recommended: Cm360 | null
  /** `coach`: chosen by the AI Coach inside the interval. `curve-peak`: the Curve Peak itself (no AI Coach, no interval, or it failed: then `notice` says why). */
  source: 'coach' | 'curve-peak'
  /** The AI Coach's reasons, in the reply language; empty for the Curve Peak. */
  reasons: string[]
  /** Why the Curve Peak is shown although the AI Coach was asked, written for the player. */
  notice?: string
  /** Identifies the data this answer is for (see `snapshotKey`). */
  snapshotKey: string
}

/** What is cached of an AI Coach answer. */
export interface CoachChoice {
  recommended: Cm360
  reasons: string[]
}

/** Where AI Coach answers are kept between presses of the button. The app persists it in localStorage (src/coach/choice-cache.ts). */
export interface ChoiceCache {
  get(key: string): CoachChoice | undefined
  set(key: string, choice: CoachChoice): void
}

const CACHE_LIMIT = 5

/**
 * A cache of the last few answers (a new Run makes the older ones unreachable, so more would only be clutter). `entries` is what an
 * earlier cache saved through `onChange`; `onChange` gets every entry, oldest first, after each `set`.
 */
export function createChoiceCache(entries: Iterable<[string, CoachChoice]> = [], onChange?: (entries: [string, CoachChoice][]) => void, limit = CACHE_LIMIT): ChoiceCache {
  const kept = new Map(entries)
  return {
    get: (key) => kept.get(key),
    set(key, choice) {
      kept.delete(key)
      kept.set(key, choice)
      for (const oldest of kept.keys()) {
        if (kept.size <= limit) break
        kept.delete(oldest)
      }
      onChange?.([...kept])
    },
  }
}

/** Bump when the payload or the prompt changes in a way that should not reuse earlier answers. */
const PROMPT_VERSION = 'sens-1'

export interface SnapshotInput {
  fit: FinderFit
  profile: GameProfileId
  context: PlayerContext
  language: string
  /** Which model answered or will answer: the provider and the model name (and the endpoint, for an OpenAI-compatible one). */
  model: string
}

/**
 * One AI Coach answer per data snapshot: the Finder inputs (the Runs the fit used, with their Sensitivities and Scores, so any new Run
 * changes it, and Reset too), the Game Profile, Player Context, reply language and model. Needs no Analysis, so the screen can look
 * the answer up when it opens. Not in it: DPI (Game Sensitivity and eDPI are worked out when shown).
 */
export function snapshotKey({ fit, profile, context, language, model }: SnapshotInput): string {
  const safe = parsePlayerContext(context)
  const player = Object.entries(safe).sort().map(([field, value]) => `${field}=${value}`).join(',')
  return [PROMPT_VERSION, profile, fit.counts.runs, hashRuns(fit.counts.used).toString(36), player, cleanLanguage(language), model].join('|')
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The payload

/**
 * Levels in the payload. Sessions play different Sensitivities (coarse Sessions follow their own Centre, fine Sessions sit near the
 * peak), so there is no fixed list of levels: the tested range is cut into this many log-spaced bins and the Runs of a bin, whichever
 * Session they are from, are pooled with `groupRuns`. Bins nobody played are left out, so the payload has at most this many levels
 * however many Runs there are. Each is named by the geometric mean cm/360 of its Runs.
 */
const MAX_LEVELS = 9
const CURVE_SAMPLES = 13

const CLICKING_FIGURES = ['movementCount', 'accuracy', 'overshootRate', 'undershootRate', 'pathDeviation', 'smoothness', 'mouseSpeed']
const TRACKING_FIGURES = ['meanOffset', 'timeOnTargetShare', 'samples', 'mouseSpeed']

const round = (x: number, places = 2): number => Math.round(x * 10 ** places) / 10 ** places

/** The interval as shown to the AI Coach: rounded inward to 2 decimals, so copying a displayed bound never lands outside the real one. */
function shownBounds(low: number, high: number, peak: number): [number, number] {
  const lo = Math.ceil(low * 100) / 100
  const hi = Math.floor(high * 100) / 100
  return lo <= hi ? [lo, hi] : [round(peak), round(peak)]
}

/** Where the AI Coach may choose: the interval cut to what was tested (the interval itself may reach past it, ADR-0004), so it never picks an untested Sensitivity. */
function choiceBounds(fit: FinderFit): { low: number; high: number } {
  const { low, high } = fit.interval ?? { low: fit.peak ?? 0, high: fit.peak ?? 0 }
  return { low: Math.max(low, fit.range?.min ?? low), high: Math.min(high, fit.range?.max ?? high) }
}

export interface SensitivityPayload {
  /** What each kind of number is in: the AI Coach must not have to guess. */
  units: Record<string, string>
  game: { name: string; clickingWeight: number; trackingWeight: number }
  /** Field name to a fixed phrase of the player's choice; only what the player specified. */
  playerContext: Record<string, string>
  curvePeakCm360: number
  /** The interval to choose in, rounded inward (low up, high down) so that a bound copied from here is inside the real interval. */
  intervalCm360: { low: number; high: number; confidence: number }
  fitted: { runs: number; sessions: number }
  /** The Performance Curve, sampled: `score` is in Scenario spreads relative to its top (0 is the top). */
  performanceCurve: { cm360: number; score: number }[]
  /** Per level, per Scenario played there: `scenario`, `category`, `runs`, `scaledScore` and the Analysis figures of its category (rates, Path Deviation, Smoothness, Ahead/Behind, ...). */
  levels: { cm360: number; runs: number; scenarios: Record<string, string | number>[] }[]
}

/**
 * What the AI Coach sees: aggregates only. Every number is copied from an aggregate (`figuresOf` takes only numbers), so the Aim Movement
 * lists, input and target logs that Runs and Analyses carry cannot get in, whatever else they hold. `items` are the Runs the fit used.
 */
export function buildSensitivityPayload({ fit, items, profile, context }: Pick<SnapshotInput, 'fit' | 'profile' | 'context'> & { items: readonly AnalysedRun[] }): SensitivityPayload {
  const game = getGameProfile(profile)
  const { low, high } = choiceBounds(fit)
  const bounds = shownBounds(low, high, fit.peak ?? 0)
  const range = fit.range ?? { min: 1, max: 1 }
  const span = Math.log(range.max / range.min)
  const binOf = (cm360: number): number => (span > 0 ? Math.min(MAX_LEVELS - 1, Math.floor((Math.log(cm360 / range.min) / span) * MAX_LEVELS)) : 0)

  const levels = groupRuns(items, (item) => String(binOf(item.run.sensitivity)))
    .map(({ runs, aggregate }) => {
      const counted = runs.filter((r) => !r.run.warmup)
      const cm360 = Math.exp(counted.reduce((sum, r) => sum + Math.log(r.run.sensitivity), 0) / counted.length)
      return {
        cm360: round(cm360),
        runs: counted.length,
        scenarios: aggregate.scenarios.map((s) => {
          const { category, ...pooled } = s.metrics
          const figures = figuresOf(pooled)
          const wanted = category === 'clicking' ? CLICKING_FIGURES : TRACKING_FIGURES
          return {
            scenario: getScenario(s.scenario).name,
            category,
            runs: s.runs,
            scaledScore: round(s.score.mean / (fit.spread[s.scenario as ScenarioId] ?? 1), 3),
            ...Object.fromEntries(Object.entries(figures).filter(([key]) => wanted.includes(key))),
          }
        }),
      }
    })
    .filter((level) => level.runs > 0)
    .sort((a, b) => a.cm360 - b.cm360)

  const { sensitivity, score } = fit.curve
  const stride = (sensitivity.length - 1) / (CURVE_SAMPLES - 1)
  const picked = [...new Set(Array.from({ length: Math.min(CURVE_SAMPLES, sensitivity.length) }, (_, k) => Math.round(k * stride)))]

  return {
    units: {
      sensitivity: 'cm/360: centimetres of mouse travel for a full 360 degree turn. Lower is a faster (more sensitive) setting, higher is slower.',
      scaledScore: "the Scenario's Score divided by that Scenario's standard deviation over all its Runs in this Game Profile. Unitless, higher is better, only comparable within a Scenario. A level's mean is not adjusted for the day-to-day form of the Sessions it came from; the Performance Curve is.",
      performanceCurve: 'score in the same scaled units, relative to the top of the curve (0 is the top, negative is worse)',
      rates: 'overshootRate, undershootRate and accuracy are shares from 0 to 1; movementCount is the number of Aim Movements the rates rest on',
      pathDeviation: 'degrees an Aim Movement strays from the straight line to the target; lower is straighter',
      smoothness: 'velocity peaks per Aim Movement; 1 is one clean push, higher means more corrections',
      meanOffset: 'Ahead/Behind in Tracking Scenarios: degrees of the crosshair from the target along its direction of travel; positive is ahead of it, negative is behind it',
      mouseSpeed: 'degrees per second',
      timeOnTargetShare: 'share from 0 to 1 of the Run with the fire button held and the crosshair on a target',
    },
    game: { name: game.name, clickingWeight: game.weights.clicking, trackingWeight: game.weights.tracking },
    playerContext: describePlayerContext(context),
    curvePeakCm360: round(fit.peak ?? 0),
    intervalCm360: { low: bounds[0], high: bounds[1], confidence: INTERVAL_LEVEL },
    fitted: { runs: fit.counts.runs, sessions: fit.counts.sessions },
    performanceCurve: picked.map((i) => ({ cm360: round(sensitivity[i]!), score: round(score[i]!, 3) })),
    levels,
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The request

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    recommendedCm360: { type: 'number' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['recommendedCm360', 'reasons'],
  additionalProperties: false,
}

const MAX_REASONS = 5
const MAX_REASON_LENGTH = 400

const system = (language: string): string => `You are the AI Coach of BetterAim, a mouse aim trainer. A statistical model has measured how a player scores at different mouse sensitivities, and found a Curve Peak and a confidence interval around it. Inside that interval the sensitivities are statistically tied on Score. Your job is to break the tie: choose the one Recommended Sensitivity, in cm/360, that this player is best served by.

Reply in ${cleanLanguage(language)}.
Only the reasons are written text; the number is a number.

Rules:
- recommendedCm360 must lie inside the allowed interval you are given, bounds included. An answer outside it is thrown away.
- Weigh the evidence together: the balance of overshoots and undershoots (a clear surplus of overshoots hints that the setting is too fast for this player, a surplus of undershoots too slow), path deviation and smoothness (fewer corrections and straighter paths are better), whether Clicking and Tracking Scenarios favour different sensitivities (the Game Profile says how much each counts), Ahead/Behind in Tracking, and the Player Context (a smaller mousepad or wrist aiming suit a faster setting, a large pad, arm aiming or a precision role suit a slower one).
- Ground every point in the figures. Do not invent numbers. A rate that rests on few Aim Movements (movementCount under 20) is a weak signal: say so.
- Do not choose by what famous players or the game's community use. Only this player's figures count.
- Scores of different Scenarios are in different units and must not be compared with each other.
- Give two to four short reasons in plain text, no markdown. You are not asked for the Game Sensitivity or eDPI: do not give them.`

const prompt = (payload: SensitivityPayload, [lo, hi]: [number, number], reminder?: string): string =>
  `Figures of the player (JSON):\n${JSON.stringify(payload)}\n\nChoose recommendedCm360 between ${lo} and ${hi} cm/360, bounds included.${reminder ? `\n\n${reminder}` : ''}`

/** The checked answer, or a `malformed` error. Reasons are trimmed and bounded here: the schema cannot say how many or how long. */
function readAnswer(raw: unknown): CoachChoice {
  const { recommendedCm360, reasons } = raw as { recommendedCm360: number; reasons: string[] }
  const kept = reasons.map((r) => r.trim().slice(0, MAX_REASON_LENGTH)).filter((r) => r.length > 0).slice(0, MAX_REASONS)
  if (!(recommendedCm360 > 0)) throw new CoachError('malformed', 'The AI Coach did not answer in the format asked for (the sensitivity was not a positive number).')
  if (kept.length === 0) throw new CoachError('malformed', 'The AI Coach gave a sensitivity but no reasons for it.')
  return { recommended: recommendedCm360, reasons: kept }
}

const fallbackNotice = (error: unknown): string =>
  `${error instanceof CoachError ? error.message : 'The AI Coach failed in an unexpected way.'} The Curve Peak is shown as your Recommended Sensitivity instead.`

/** True when there is an interval to choose in: the AI Coach is only ever asked then. */
const canChoose = (fit: FinderFit): boolean => fit.peak !== null && fit.interval !== null

export interface RecommendInput extends SnapshotInput {
  /** The connected AI Coach, or null when there is none. */
  provider: CoachProvider | null
  /** The Finder Runs with their Analyses; only the ones the fit used (`fit.counts.used`) are read. Aggregates only ever leave this function. */
  items: readonly AnalysedRun[]
  cache?: ChoiceCache
}

/**
 * The AI Coach's earlier answer for this data, or null. Never calls the AI Coach and needs no Analysis: the result screen uses it when it
 * opens, so the same data keeps the same Recommended Sensitivity.
 */
export function cachedRecommendation(input: SnapshotInput & { cache: ChoiceCache }): Recommendation | null {
  if (!canChoose(input.fit)) return null
  const key = snapshotKey(input)
  const hit = input.cache.get(key)
  return hit ? { recommended: hit.recommended, source: 'coach', reasons: hit.reasons, snapshotKey: key } : null
}

/**
 * Asks the AI Coach for the Recommended Sensitivity, once per press of the button (the caller never calls this by itself).
 * - No provider, no Curve Peak, or no interval (one Session): no call; the Curve Peak, or nothing.
 * - Cached for this snapshot: no call; the same answer.
 * - Otherwise one structured request. An answer outside the interval is retried once with a reminder naming it; if the second is outside
 *   too, or on refusal, error or malformed output (those are not retried), the Curve Peak is returned with a notice.
 * Only an accepted AI Coach answer is cached: after a failure of any kind the next press asks again.
 */
export async function recommendSensitivity(input: RecommendInput): Promise<Recommendation> {
  const { provider, fit, items, cache } = input
  const key = snapshotKey(input)
  const curvePeak = (notice?: string): Recommendation => ({ recommended: fit.peak, source: 'curve-peak', reasons: [], ...(notice !== undefined && { notice }), snapshotKey: key })
  if (!provider || !canChoose(fit)) return curvePeak()
  const hit = cache && cachedRecommendation({ ...input, cache })
  if (hit) return hit

  const { low, high } = choiceBounds(fit)
  const used = new Set(fit.counts.used.map((r) => r.id))
  const payload = buildSensitivityPayload({ fit, items: items.filter((i) => used.has(i.run.id)), profile: input.profile, context: input.context })
  const bounds: [number, number] = [payload.intervalCm360.low, payload.intervalCm360.high]
  const ask = async (reminder?: string): Promise<CoachChoice> =>
    readAnswer(await askJson(provider, { system: system(input.language), prompt: prompt(payload, bounds, reminder), name: 'recommended_sensitivity', schema: RESULT_SCHEMA }))
  const isInside = (cm360: number): boolean => cm360 >= low && cm360 <= high

  try {
    let answer = await ask()
    if (!isInside(answer.recommended)) {
      const first = answer.recommended
      answer = await ask(`Your previous answer, ${first} cm/360, was outside the allowed interval of ${bounds[0]} to ${bounds[1]} cm/360. Answer again with recommendedCm360 between ${bounds[0]} and ${bounds[1]}, bounds included.`)
      if (!isInside(answer.recommended)) {
        return curvePeak(
          `The AI Coach chose ${first} cm/360 and then ${answer.recommended} cm/360, both outside the interval of the Curve Peak (${bounds[0]} to ${bounds[1]} cm/360). The Curve Peak is shown as your Recommended Sensitivity instead.`,
        )
      }
    }
    cache?.set(key, answer)
    return { recommended: answer.recommended, source: 'coach', reasons: answer.reasons, snapshotKey: key }
  } catch (error) {
    return curvePeak(fallbackNotice(error))
  }
}
