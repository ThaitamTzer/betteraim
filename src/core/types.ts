// Shared vocabulary of the headless core. No DOM, WebGL or React in src/core (enforced, see src/core/README.md).

/** Sensitivity is always cm/360 inside BetterAim, never Game Sensitivity or eDPI (see GLOSSARY.md). */
export type Cm360 = number

/**
 * Field of view along one screen axis, in degrees, as it appears on the player's screen.
 * Game-specific FOV rules (4:3 vs 16:9 base, ...) are converted to this before a Run starts.
 * The core records it but it must never influence targets or Score (they are defined in degrees).
 */
export interface Fov {
  degrees: number
  axis: 'horizontal' | 'vertical'
}

export type ScenarioId = 'flick' | 'micro' | 'strafe' | 'switch'
export type ScenarioCategory = 'clicking' | 'tracking'
export type RunMode = 'finder' | 'practice'

/** A view direction in degrees: yaw > 0 turns right, pitch > 0 looks up. Pitch of the crosshair stays in [-89, 89]. */
export interface Aim {
  yaw: number
  pitch: number
}

/**
 * Timestamped raw input. `t` is ms since the Run started (fractional allowed).
 * `move` carries raw mouse counts with the DOM sign convention: dx > 0 is right, dy > 0 is DOWN.
 * Button 0 is the fire button. A `tick` only advances time; it is never stored in a Run record.
 */
export type InputEvent =
  | { kind: 'move'; t: number; dx: number; dy: number }
  | { kind: 'down' | 'up'; t: number; button: number }
  | { kind: 'tick'; t: number }

/** The input that is stored in a Run record. */
export type RecordedInput = Exclude<InputEvent, { kind: 'tick' }>

/** A live target. `radius` is its angular radius in degrees as seen from the crosshair origin. */
export interface Target extends Aim {
  id: number
  radius: number
}

/**
 * What the Scenario reports about its targets. Every removal is a `kill`, so a Clicking hit is
 * `shot` (id) + `kill` at the same `t`. A `shot` with `id: null` missed. `crosshair` on `spawn` is where
 * the Aim Movement toward the new target starts.
 */
export type TargetEvent =
  | { kind: 'spawn'; t: number; id: number; yaw: number; pitch: number; radius: number; crosshair: Aim }
  | { kind: 'shot'; t: number; id: number | null }
  | { kind: 'kill'; t: number; id: number }

/** Everything that makes a Run reproducible. Replaying `input` under the same params gives the same result. */
export interface RunParams {
  scenario: ScenarioId
  seed: number
  sensitivity: Cm360
  dpi: number
  fov: Fov
}

/**
 * How the browser captured this Run, recorded so old Runs can be re-analysed later. `movementX/Y` units differ per
 * browser (Chrome: physical pixels, Firefox: CSS pixels scaled by display scale and page zoom), so the same mouse can
 * deliver counts scaled by `devicePixelRatio` and zoom. The core only stores it; it is supplied by the shell.
 */
export interface RunEnv {
  devicePixelRatio: number
  userAgent: string
  /** Whether the pointer lock gave unadjusted movement (no OS acceleration), as detected when the Run started. */
  rawInput: boolean
}

/** Facts the app shell supplies; the core never reads a clock or generates ids. */
export interface RunMeta {
  id: string
  /** Epoch ms, supplied by the shell. */
  startedAt: number
  gameProfileId: string
  mode: RunMode
  warmup: boolean
  /** Absent for Practice Runs, which are not part of a Session. */
  sessionId?: string
  /** The shell sets it on every Run; absent only in Runs imported from before it was captured. */
  env?: RunEnv
}

export interface RunResult {
  /** The input the core accepted (late events already clamped), without ticks. */
  input: readonly RecordedInput[]
  targetEvents: readonly TargetEvent[]
  score: number
}

/** The persisted Run (see storage.ts). Build it with `{ ...params, ...meta, ...run.result() }`. */
export type RunRecord = RunParams & RunMeta & RunResult

/** Live state for rendering and for bots. */
export interface RunState {
  /** ms since Run start, as of the last accepted event. */
  t: number
  done: boolean
  crosshair: Aim
  /** Targets alive now (Switch has several). */
  targets: readonly Target[]
  /** Score so far; final once `done`. */
  score: number
}
