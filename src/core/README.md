# Headless core (the seam)

Pure TypeScript. No DOM, WebGL, React, clock or `Math.random`. Enforced by `tsconfig.core.json` (no DOM lib, run by
`pnpm build`) and `src/boundary.test.ts`. The shell imports from `src/core/index.ts` only. Tests drive this seam only.

## Layout
- `types.ts` shared types. `aim.ts` degrees per count, sphere geometry (`angleBetween`, `offsetAim`, `aimDelta`), FOV.
- `run.ts` the engine: `createRun(params)`, `replay`. `scenario.ts` what a Scenario implements (`Rules`).
- `scenarios/` `clicking.ts` (shared by Flick and Micro), `flick.ts`, `micro.ts`, `index.ts` (the registry, one line per Scenario).
- `analysis/` `analyseRun(run)`: Run Analysis, a union on Scenario category. Clicking (#7) is implemented, `tracking` is a stub for
  #8. It replays `input` to rebuild the crosshair path, so a `RunRecord` is all it needs. `clicking.ts` Aim Movements, Ideal Path and
  classification; `velocity.ts` smoothing, peaks and the thresholds (read its header before changing one).
- `rng.ts` `createRng(seed)`. `tally.ts` `tallyShots`. `testing/` bots and test params (tests only).
- `codec.ts` lossless binary form of `input` and `targetEvents` (+ base64). `storage.ts` the `RunStore` port (`save`, `list(filter)`
  summaries, `get`) and `createMemoryStore()` for tests. `exchange.ts` `exportData`/`importData`: one versioned JSON file, validated
  before any write, merged by Run id. The IndexedDB adapter is shell code in `src/storage/`. `testing/records.ts` `testRecord()` is a
  fully played record.
- `game-profiles.ts` the 7 Game Profiles (yaw, vertical setting, FOV, default Game Sensitivity, Clicking/Tracking weights, each
  value with its source), the Game Sensitivity <-> cm/360 formulas, the Converter (`convertSensitivity`, `readSensitivity`) and
  `profileFov(id)`, the `Fov` a Run renders with (always vertical, so a horizontal FOV on a 4:3 or 16:9 base is Hor+). `practiceFov(id, override)` is the Practice-only variant (Options' FOV override); the Sensitivity Finder must call `profileFov(id)`.
  A Game Profile id (`GameProfileId`) is what `RunMeta.gameProfileId` holds. Add a game by adding one entry to the table.
- Not here yet: Tracking Analysis (#8), Finder (#9-#11), AI Coach (#14, #15).

## Conventions
- Units: degrees, ms since Run start, Sensitivity = cm/360. Yaw > 0 is right, pitch > 0 is up (crosshair pitch is clamped to
  +-89). The crosshair starts at yaw 0, pitch 0. Raw `move` counts use the DOM sign: dy > 0 is down. Button 0 fires.
- Sizes, distances and speeds are defined in degrees. `RunParams.fov` is recorded but must never affect targets or Score.
- `createRun(params).push(event)` takes `move | down | up | tick` events in time order (late ones are clamped). The first event
  at or after 30 000 ms ends the Run and is dropped. `state()` is live; `result()` (input, target events, Score) needs `done`.
- Simulated time advances in 1 ms steps (`Rules.step`) whatever the tick rate; ticks are not stored in a record.
- A persisted Run is `RunRecord = { ...params, ...meta, ...run.result() }`. The core never makes ids or reads a clock: the
  shell supplies `RunMeta` (`id`, `startedAt`, `gameProfileId`, `mode`, `warmup`, `sessionId`, absent in Practice, and `env`, absent only in old imports). `env` is the capture
  environment (`devicePixelRatio`, `userAgent`, `rawInput`): `movementX/Y` units differ per browser, so old Runs need it to be re-analysed.
- Storage: `list` returns summaries (no input), `get` the whole record. Importing never deletes; a Run with a known id is replaced.
- Target log: `spawn` (with the crosshair at spawn), `shot` (`id` or `null` for a miss), `kill`. Replaying the input with
  `replay(params, input)` rebuilds targets over time for Analysis; no motion samples are logged.

## Adding a Scenario
Implement `ScenarioDefinition` (`rules(seed)` returns `Rules`: `targets`, `events`, `score`, plus `shoot` for Clicking and
`step(t, aim, held)` for Tracking) and add it to `scenarios/index.ts`. Micro is `createClickingScenario({ id: 'micro', ... })` in `scenarios/micro.ts`. A definition also carries `name` and `description`: Practice's picker lists the registry and shows them.
Scenario files must never import `run.ts` (it imports the registry, so that is a cycle); `RUN_DURATION_MS` and `STEP_MS` live in
`scenario.ts`.

## Writing a bot test
A `Bot` gets the `RunState` each tick and returns `{ turn?: {yaw, pitch} degrees, fire?: held }`. `runBot(params, bot)` plays a
whole Run (integer counts, remainder carried) and returns the `RunResult`. `fire` is the held state: click = true then false.
```ts
const result = runBot(testParams(), aimBot({ gain: 1.3 })) // perfect: aimBot(); stops short: gain 0.7; reaction: reactionMs
const wasteful = runBot(testParams(), missBot(aimBot(), 2)) // two wasted shots per target
// custom (sketch of a tracking bot that lags 120 ms): state lives in a closure, one entry per 1 ms tick
const seen: Target[] = []
const lagging: Bot = (s) => {
  if (s.targets[0]) seen.push(s.targets[0])
  const past = seen[Math.max(0, seen.length - 121)]
  return past && { turn: aimDelta(s.crosshair, past), fire: true }
}
```
Overshoot, undershoot and reaction time are covered in `testing/bots.test.ts`. `lineBot({ bursts, burstMs, pauseMs, bow })` follows
the great circle to the target (`aimBot` interpolates in yaw/pitch, so it drifts off the Ideal Path): one push is smooth, several
are jerky, `bow` bends it sideways. Analysis tests (`analysis/clicking.test.ts`) run bots at several Sensitivity/DPI settings.

## Determinism rules
- Randomness only from `createRng(seed)`, with a number of draws that does not depend on input (Finder Runs share a seed
  across Sensitivities). Time only from event `t`. No `Date`, no `Math.random`, no iteration order that depends on input.
- Keep geometry in degrees on the sphere (`angleBetween`), never flat yaw/pitch distance.
