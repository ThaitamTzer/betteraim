import { aimDelta, aimOf, cross, degreesPerCount, directionOf, dot } from '../aim'
import { createRun, RUN_DURATION_MS } from '../run'
import type { Aim, RunParams, RunResult, RunState } from '../types'

/** What a bot asks for on one tick. `turn` is in degrees (yaw > 0 right, pitch > 0 up); `fire` is whether the fire button is held. */
export interface BotAction {
  turn?: Aim
  fire?: boolean
}

/** A bot looks at the state as of this tick and decides. It may keep its own state in a closure. */
export type Bot = (state: RunState) => BotAction | void

/**
 * Plays one whole Run with a bot, 1 ms per tick by default. The bot's turns become integer mouse counts;
 * the fractional remainder is carried to the next tick, so slow movements do not drift.
 */
export function runBot(params: RunParams, bot: Bot, { tickMs = 1 }: { tickMs?: number } = {}): RunResult {
  const run = createRun(params)
  const perCount = degreesPerCount(params.sensitivity, params.dpi)
  let carryX = 0
  let carryY = 0
  let down = false
  for (let t = 0; t < RUN_DURATION_MS; t += tickMs) {
    run.push({ kind: 'tick', t })
    const action = bot(run.state())
    if (action?.turn) {
      const x = action.turn.yaw / perCount + carryX
      const y = -action.turn.pitch / perCount + carryY
      const dx = Math.round(x)
      const dy = Math.round(y)
      carryX = x - dx
      carryY = y - dy
      if (dx !== 0 || dy !== 0) run.push({ kind: 'move', t, dx, dy })
    }
    const fire = action?.fire ?? false
    if (fire !== down) {
      down = fire
      run.push({ kind: fire ? 'down' : 'up', t, button: 0 })
    }
  }
  run.push({ kind: 'tick', t: RUN_DURATION_MS })
  return run.result()
}

/** Smooth 0 to 1 position profile of a human-like movement (minimum jerk): bell-shaped speed. */
export const minJerk = (x: number): number => {
  const s = Math.max(0, Math.min(1, x))
  return s * s * s * (10 - 15 * s + 6 * s * s)
}

export interface AimBotOptions {
  /** 1 lands on the target; 1.3 overshoots by 30% then corrects back; 0.7 stops short then corrects. */
  gain?: number
  /** Duration of the main movement toward the target. */
  moveMs?: number
  /** Delay between a target appearing and the bot starting to move. */
  reactionMs?: number
  /** Duration of the correcting movement when gain is not 1. */
  correctionMs?: number
}

/** Clicking bot: for each new target, one smooth movement (plus a correction if gain != 1), then clicks. Defaults to perfect. */
export function aimBot({ gain = 1, moveMs = 120, reactionMs = 0, correctionMs = 80 }: AimBotOptions = {}): Bot {
  let seen = -1
  let start = 0
  let from: Aim = { yaw: 0, pitch: 0 }
  let firing = false
  const lerp = (a: Aim, b: Aim, f: number): Aim => ({ yaw: a.yaw + (b.yaw - a.yaw) * f, pitch: a.pitch + (b.pitch - a.pitch) * f })
  return (state) => {
    const target = state.targets[0]
    if (!target) return
    if (target.id !== seen) {
      seen = target.id
      start = state.t + reactionMs
      from = state.crosshair
      firing = false
    }
    const delta = aimDelta(from, target)
    const goal: Aim = { yaw: from.yaw + delta.yaw, pitch: from.pitch + delta.pitch }
    const peak = lerp(from, goal, gain)
    const elapsed = state.t - start
    let desired: Aim
    if (elapsed < moveMs) desired = lerp(from, peak, minJerk(elapsed / moveMs))
    else if (gain !== 1 && elapsed < moveMs + correctionMs) desired = lerp(peak, goal, minJerk((elapsed - moveMs) / correctionMs))
    else desired = goal
    const arrived = elapsed >= moveMs + (gain !== 1 ? correctionMs : 0)
    if (arrived) firing = !firing
    return { turn: aimDelta(state.crosshair, desired), fire: arrived && firing }
  }
}

export interface LineBotOptions {
  /** Duration of each push toward the target. */
  burstMs?: number
  /** The way to the target is covered in this many equal pushes (1 is smooth, more is jerky). */
  bursts?: number
  /** Standstill between pushes. */
  pauseMs?: number
  /** Degrees the path bows sideways away from the Ideal Path at its midpoint (0 is a straight line). */
  bow?: number
}

/**
 * Clicking bot that follows the Ideal Path (the great circle to the target), unlike `aimBot`, which interpolates in
 * yaw/pitch and so drifts off that circle at high pitch. It never overshoots; it then clicks.
 */
export function lineBot({ burstMs = 120, bursts = 1, pauseMs = 0, bow = 0 }: LineBotOptions = {}): Bot {
  const total = bursts * burstMs + (bursts - 1) * pauseMs
  let seen = -1
  let start = 0
  let from = directionOf({ yaw: 0, pitch: 0 })
  let firing = false
  return (state) => {
    const target = state.targets[0]
    if (!target) return
    if (target.id !== seen) {
      seen = target.id
      start = state.t
      from = directionOf(state.crosshair)
      firing = false
    }
    const to = directionOf(target)
    const normal = cross(from, to)
    const size = Math.hypot(...normal)
    const angle = Math.atan2(size, dot(from, to))
    const elapsed = state.t - start
    const burst = Math.min(bursts - 1, Math.floor(elapsed / (burstMs + pauseMs)))
    const progress = elapsed >= total ? 1 : (burst + minJerk((elapsed - burst * (burstMs + pauseMs)) / burstMs)) / bursts
    // Slerp along the great circle, then bow sideways (along the plane's normal) by bow x sin(pi x progress) degrees.
    const sideways = (bow * Math.sin(Math.PI * progress) * Math.PI) / 180
    const [a, b] = [Math.sin((1 - progress) * angle) / Math.sin(angle), Math.sin(progress * angle) / Math.sin(angle)]
    const desired = aimOf(
      [0, 1, 2].map(
        (i) => ((from[i] ?? 0) * a + (to[i] ?? 0) * b) * Math.cos(sideways) + ((normal[i] ?? 0) / size) * Math.sin(sideways),
      ) as [number, number, number],
    )
    const arrived = elapsed >= total
    if (arrived) firing = !firing
    return { turn: aimDelta(state.crosshair, desired), fire: arrived && firing }
  }
}

/** Wraps a clicking bot: at each new target it first fires `missesPerTarget` shots without moving, which always miss. */
export function missBot(inner: Bot, missesPerTarget = 1): Bot {
  let seen = -1
  let tick = 0
  return (state) => {
    const id = state.targets[0]?.id
    if (id !== undefined && id !== seen) {
      seen = id
      tick = 0
    }
    // release first (the previous shot may still be held), then press and release once per miss
    if (tick < 2 * missesPerTarget + 1) return { fire: tick++ % 2 === 1 }
    return inner(state)
  }
}
