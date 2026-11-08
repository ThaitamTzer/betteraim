import { cm360For, getGameProfile, getScenario, planSession, profileFov } from '../core'
import type { Cm360, Fov, GameProfileId, NextSession, PlannedRun, RunRecord } from '../core'
import type { Route } from './routes'
import type { Settings } from './settings'

/** Rests make a Session about 10 minutes: 16 Runs of 30 s is 8, plus this wait before each of the 15 next Runs. */
export const MIN_REST_SECONDS = 8

/**
 * Where raw mouse input (Pointer Lock `unadjustedMovement`) works, from the pointer-lock research notes (2026-11-08,
 * MDN browser-compat-data). This replaces ADR-0001's older "Chromium only": Firefox 152 and Safari 18.4 added the option.
 * Firefox and Safari report `movementX/Y` in other units than Chrome; the Run's `env` records that for later correction.
 */
export const RAW_INPUT_BROWSERS =
  'Chrome, Edge and Opera 88 or newer on Windows, macOS or ChromeOS; Firefox 152 or newer on Windows or macOS; Safari 18.4 or newer. Linux is not supported yet.'

/**
 * A Sensitivity Finder Session in progress. Lives in the route (memory only), so a reload ends it: the Runs finished so far
 * are already saved, and the unfinished (Session, Scenario) pairs are simply left out of the estimate.
 */
export interface FinderSession {
  id: string
  gameProfileId: GameProfileId
  dpi: number
  /** Always the Game Profile FOV (`profileFov`), never the Practice override. */
  fov: Fov
  plan: readonly PlannedRun[]
  /** Levels per Scenario in this plan (saved with every Run as `RunMeta.levels`). */
  levels: number
  /** Runs finished so far: the index of the next one in `plan`. */
  done: number
}

/** The player's current Sensitivity in cm/360 (onboarding fills the Game Profile default until they change it): the Centre until the Finder has data. */
export const centreOf = ({ gameProfileId, gameSensitivity, dpi }: Pick<Settings, 'gameProfileId' | 'gameSensitivity' | 'dpi'>): Cm360 =>
  cm360For(gameProfileId, gameSensitivity, dpi)

/** The Session the planner chose (`nextSession`: coarse, fine or shifted), turned into a Run list. `next.levels` is what every Run plays, so `levels` is 7 or 5. */
export function newFinderSession(settings: Settings, seed: number, id: string, next: NextSession): FinderSession {
  const { gameProfileId, dpi } = settings
  const weights = getGameProfile(gameProfileId).weights
  return {
    id,
    gameProfileId,
    dpi,
    fov: profileFov(gameProfileId),
    plan: planSession({ centre: next.centre, levels: next.levels, weights, seed }),
    levels: next.levels.length,
    done: 0,
  }
}

/** Screens that sit between Runs (or end the Session). */
export type FinderStep = 'rest' | 'abandoned' | 'notRaw' | 'complete'

/** "Run 5 of 16"; the first two are Warm-up Runs. Never the Sensitivity. */
export const runLabel = ({ done, plan }: FinderSession): string => `Run ${done + 1} of ${plan.length}${plan[done]?.warmup ? ' (warm-up)' : ''}`

/**
 * Where a finished Session goes: the Finder result screen. `last` is the Run that just ended; its save is still in flight, so
 * the screen waits for it (`saving`) before it reads the Runs and reports a failed save. (The `complete` step of `finderSession` is no longer reached.)
 */
export const sessionEnd = (session: FinderSession, last?: RunRecord): Route => ({
  name: 'finderResult',
  gameProfileId: session.gameProfileId,
  dpi: session.dpi,
  sessionId: session.id,
  ...(last && { saving: last.id }),
})

/** The next planned Run, ready for the `run` route. Resuming an abandoned Run calls this again with the same `done`. */
export function runRoute(session: FinderSession): Extract<Route, { name: 'run' }> {
  const planned = session.plan[session.done]
  if (!planned) throw new Error('This Session has no Run left to play')
  const { id, gameProfileId, dpi, fov, levels, plan, done } = session
  const between = (step: FinderStep): Route => ({ name: 'finderSession', session, step })
  return {
    name: 'run',
    params: { scenario: planned.scenario, seed: planned.seed, sensitivity: planned.sensitivity, dpi, fov },
    meta: { gameProfileId, mode: 'finder', warmup: planned.warmup, sessionId: id, levels },
    session: { label: runLabel(session), onAbandon: between('abandoned'), onNotRaw: between('notRaw') },
    next: (record) => {
      const after = { ...session, done: done + 1 }
      return done + 1 === plan.length ? sessionEnd(after, record) : { name: 'finderSession', session: after, step: 'rest', last: record }
    },
  }
}

export interface StepView {
  heading: string
  /** Runs finished of the whole Session, for a progress bar. */
  progress: { done: number; total: number }
  lines: string[]
}

/**
 * The text of a between-Runs screen. Pure and built only from counts and Scenario names, so the Sensitivity of any Run
 * cannot reach the screen through it (`finder.test.ts` checks every step).
 */
export function stepView(session: FinderSession, step: FinderStep): StepView {
  const { done, plan } = session
  const progress = { done, total: plan.length }
  const planned = plan[done]
  const finished = `${done} of ${plan.length} Runs finished and saved.`
  switch (step) {
    case 'rest':
      return {
        heading: 'Rest',
        progress,
        lines: [
          `Next: ${runLabel(session)}${planned ? `, ${getScenario(planned.scenario).name}` : ''}.`,
          ...(planned?.warmup ? ['A Warm-up Run does not count toward your result.'] : []),
          'Let go of the mouse, shake out your hand and look away from the screen. Start when you are ready.',
        ],
      }
    case 'abandoned':
      return {
        heading: 'Run abandoned',
        progress,
        lines: [
          `Nothing was kept from that Run. ${finished}`,
          'Resume plays the same Run again. Quitting keeps the Runs you finished, but a Scenario you did not play at every level is left out of your result.',
        ],
      }
    case 'notRaw':
      return {
        heading: 'The Sensitivity Finder needs raw mouse input',
        progress,
        lines: [
          'This browser captured the mouse with OS pointer acceleration, which would distort every Sensitivity. The unfinished Run was not recorded as a Finder Run.',
          `Raw input works in: ${RAW_INPUT_BROWSERS}`,
          'Practice still works here, from Home.',
        ],
      }
    case 'complete':
      return { heading: 'Session complete', progress, lines: [`Runs completed: ${done} of ${plan.length}.`] }
  }
}
