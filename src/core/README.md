# Headless core (the seam)

Pure TypeScript. No DOM, WebGL, React, clock or `Math.random`. Enforced by `tsconfig.core.json` (no DOM lib, run by
`pnpm build`) and `src/boundary.test.ts`. The shell imports from `src/core/index.ts` only. Tests drive this seam only.

## Layout
- `types.ts` shared types. `aim.ts` degrees per count, sphere geometry (`angleBetween`, `offsetAim`, `aimDelta`), FOV.
- `run.ts` the engine: `createRun(params)`, `replay`. `scenario.ts` what a Scenario implements (`Rules`).
- `scenarios/` `clicking.ts` (shared by Flick and Micro), `flick.ts`, `micro.ts`, `strafe.ts`, `switch.ts`, `wander.ts` (target motion
  for the Tracking Scenarios), `index.ts` (the registry, one line per Scenario).
- `rng.ts` `createRng(seed)`. `tally.ts` `tallyShots`. `testing/` bots and test params (tests only).
- `codec.ts` lossless binary form of `input` and `targetEvents` (+ base64). `storage.ts` the `RunStore` port (`save`, `list(filter)`
  summaries, `get`) and `createMemoryStore()` for tests. `exchange.ts` `exportData`/`importData`: one versioned JSON file, validated
  before any write, merged by Run id. The IndexedDB adapter is shell code in `src/storage/`. `testing/records.ts` `testRecord()` is a
  fully played record.
- `game-profiles.ts` the 7 Game Profiles (yaw, vertical setting, FOV, default Game Sensitivity, Clicking/Tracking weights, each
  value with its source), the Game Sensitivity <-> cm/360 formulas, the Converter (`convertSensitivity`, `readSensitivity`) and
  `profileFov(id)`, the `Fov` a Run renders with (always vertical, so a horizontal FOV on a 4:3 or 16:9 base is Hor+).
  A Game Profile id (`GameProfileId`) is what `RunMeta.gameProfileId` holds. Add a game by adding one entry to the table.
- Not here yet: Analysis (#7, #8), Finder (#9-#11), AI Coach (#14, #15).

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
  `replay(params, input)` returns the result again; `replaySteps` (see Tracking Scenarios) gives the targets and crosshair at every ms for Analysis. No motion samples are logged.

## Tracking Scenarios (Strafe, Switch)
- **On-target rule (both):** 1 ms of simulated time counts as on target only while the fire button is held AND the crosshair
  is within the target's `radius`. Holding fire elsewhere, or tracking without firing, earns nothing.
- **Strafe:** one target, `Score` = 100 x (on-target ms) / (ms elapsed), so it is a live percentage that is final at 30 s.
  **Switch:** three targets alive; a target falls (`kill`, then a replacement `spawn` at the same `t`) once it has 400 ms
  on target in total. The time is summed per target and kept when the crosshair looks away and comes back. `Score` = falls
  (at most 75). There are four spots 24 degrees apart in yaw, three of them taken: the replacement goes to the free one, and
  the spot it fell from becomes the free one. So it never reappears where it fell and the player has to switch.
- **Motion** is closed-form in time (`scenarios/wander.ts`: sums of sines, periods and phases from the seed), defined in
  degrees and independent of FOV, Sensitivity, DPI and input. Strafe stays within 24 degrees yaw / 5 pitch of the start
  and peaks near 40 degrees per second; Switch targets drift at up to about 12 degrees per second.
- **Reading the path (ticket #8, Ahead/Behind):** every moving `Target` in `RunState.targets` carries `speed` (degrees per
  second on the sphere) and `heading` (direction of travel as a bearing, 0 = up, 90 = right, the `offsetAim` convention); `RunState.held`
  is the fire button. The target log only holds `spawn` and `kill` (no `shot`, no motion samples), so get the path from the `RunRecord`
  by replay: `replaySteps(record, record.input, (state) => ...)` calls back for every simulated step t = 1 ... 30 000 ms with
  exactly what `Rules.step` saw then (targets at t; crosshair and `held` as the input before t left them). Use it, do not hand-roll
  a tick-then-events loop: recorded times are fractional (an event at 12.4 ms takes effect from step 13), and applying them a step
  early or late moves Switch kills and everything after them. This order is a contract the replay depends on.
```ts
replaySteps(record, record.input, ({ crosshair, held, targets }) => {
  // per ms: targets[i] has yaw, pitch, radius, speed, heading; on target = held && angleBetween(crosshair, targets[i]) <= radius
})
```
  Signed offset along the direction of travel: take the crosshair's offset from the target in the target's local
  east/north (east = `wrapDeg(dyaw) * cos(pitch)`, north = `dpitch`) and project it on `(sin heading, cos heading)`.
  Positive is Ahead, negative is Behind. Summing the on-target steps and dividing by 30 000 gives Strafe's Score back exactly.

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
Overshoot, undershoot and reaction time are covered in `testing/bots.test.ts`.

`trackBot({ leadMs })` is the Tracking bot: it holds fire and keeps the crosshair on the first of `state.targets`, staying on that
target until it is gone. `leadMs` aims that many ms of the target's travel ahead of it (> 0, Ahead) or behind it (< 0, Behind);
0 is dead on. Build a leading or lagging bot with `trackBot({ leadMs: 100 })` / `trackBot({ leadMs: -100 })`.

## Determinism rules
- Randomness only from `createRng(seed)`, with a number of draws that does not depend on input (Finder Runs share a seed
  across Sensitivities). Time only from event `t`. No `Date`, no `Math.random`, no iteration order that depends on input.
- Keep geometry in degrees on the sphere (`angleBetween`), never flat yaw/pitch distance.
