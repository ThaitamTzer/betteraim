import { aggregateRuns } from '../aggregate'
import type { AnalysedRun } from '../aggregate'
import { getGameProfile, isGameProfileId } from '../game-profiles'
import { getScenario } from '../scenarios'
import type { ScenarioId } from '../types'
import { CoachError } from './provider'
import type { CoachProvider } from './provider'

/** Adding a Scenario fails to compile until it says what its Score counts: the Coach must not compare Scores in different units. */
const SCORE_UNIT: Record<ScenarioId, string> = {
  flick: 'hits multiplied by accuracy',
  micro: 'hits multiplied by accuracy',
  strafe: 'percent of the Run spent on target',
  switch: 'number of targets eliminated',
}

export type Figures = { [key: string]: number | Figures }

/**
 * Only the numbers of a pooled `Metrics` object, nested objects of numbers included, nothing else. Whatever a metric is
 * named, an array (such as a list of Aim Movements) or any other value cannot get into the payload this way, so the
 * "aggregates only, never raw mouse data" rule holds by construction, also for metrics added later.
 */
export function figuresOf(source: object): Figures {
  const out: Figures = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) out[key] = figuresOf(value)
  }
  return out
}

export interface AdvicePayload {
  game: string
  /** Distinct Sensitivities (cm/360) of the counted Runs. */
  sensitivityCm360: number[]
  warmupRunsLeftOut: number
  scenarios: {
    name: string
    category: string
    runs: number
    score: { mean: number; best: number; unit: string }
    /** The pooled Analysis figures of the Scenario (rates are 0 to 1). */
    metrics: Figures
  }[]
}

/** What the AI Coach sees of a Practice Session: Session Analysis aggregates, never a Run's input, target log or Aim Movements. */
export function buildAdvicePayload(items: readonly AnalysedRun[]): AdvicePayload {
  const { scenarios, warmups } = aggregateRuns(items)
  const counted = items.filter((i) => !i.run.warmup)
  // The Game Profile the Runs were played in, not the one set up now: the player may have switched game since.
  const gameId = counted[0]?.run.gameProfileId ?? ''
  return {
    game: isGameProfileId(gameId) ? getGameProfile(gameId).name : gameId,
    sensitivityCm360: [...new Set(counted.map((i) => Math.round(i.run.sensitivity * 100) / 100))].sort((a, b) => a - b),
    warmupRunsLeftOut: warmups,
    scenarios: scenarios.map((s) => {
      const { category, ...pooled } = s.metrics
      return {
        name: getScenario(s.scenario).name,
        category,
        runs: s.runs,
        score: { mean: Math.round(s.score.mean * 100) / 100, best: Math.round(s.score.best * 100) / 100, unit: SCORE_UNIT[s.scenario] },
        metrics: figuresOf(pooled),
      }
    }),
  }
}

/** A free-text language comes from the player: one short line, so it cannot carry instructions of its own. */
export const cleanLanguage = (language: string): string => language.replace(/\s+/g, ' ').trim().slice(0, 40) || 'English'

const system = (language: string) => `You are the AI Coach of BetterAim, a mouse aim trainer. A player has just finished a Practice Session. Write training advice for them from the figures you are given.

Reply in ${cleanLanguage(language)}.

Rules:
- Plain text only: no markdown, no tables. Short paragraphs or lines that start with "- ". About 150 to 250 words.
- Ground every point in the figures. Do not invent numbers. A rate that rests on few Aim Movements (movementCount under 20) or few shots is a weak signal: say so.
- Scores of different Scenarios are in different units: never compare them with each other.
- Name the one or two things to work on first, and how to practise them (which Scenario, what to pay attention to).
- This is training advice only: do not recommend a mouse sensitivity number.

The figures:
- accuracy: hits divided by shots, 0 to 1.
- overshootRate: the share of Aim Movements whose first push ended beyond the target's far edge. undershootRate: the share that ended short of its near edge. The rest ended on the target.
- pathDeviation: how far, in degrees, an Aim Movement strays from the straight line to the target (lower is straighter).
- smoothness: velocity peaks per Aim Movement. 1 is one clean push; higher means more corrections.
- mouseSpeed: degrees per second during Aim Movements.
- Tracking Scenarios (Strafe, Switch) carry these instead:
  - timeOnTargetShare: the share (0 to 1) of the Run with the fire button held and the crosshair on a target. timeOnTargetMs is the same in milliseconds.
  - meanOffset: Ahead/Behind, the mean distance in degrees of the crosshair from the target along the target's direction of travel. Positive is ahead of the target, negative is behind it, near 0 is level.
  - samples: how many 1 ms steps meanOffset and mouseSpeed average over. With 0 samples there is nothing to read from them.
  - mouseSpeed: degrees per second of the crosshair over those steps.`

/**
 * Asks the AI Coach for written advice on a Practice Session: one request, no retry, called only when the player asks.
 * Throws a `CoachError`; an empty answer is `malformed`.
 */
export async function practiceAdvice(provider: CoachProvider, { items, language }: { items: readonly AnalysedRun[]; language: string }): Promise<string> {
  const payload = buildAdvicePayload(items)
  if (payload.scenarios.length === 0) throw new Error('There are no counted Runs in this Session to give advice on.')
  const text = (await provider.complete({ system: system(language), prompt: `Figures of the Session (JSON):\n${JSON.stringify(payload, null, 1)}` })).trim()
  if (!text) throw new CoachError('malformed', 'The AI Coach sent an empty answer. Try again, or try another model.')
  return text
}
