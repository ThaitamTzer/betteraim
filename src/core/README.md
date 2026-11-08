# Headless core (the seam)

Pure TypeScript. No DOM, WebGL, React, clock or `Math.random`. Enforced by `tsconfig.core.json` (no DOM lib, run by
`pnpm build`) and `src/boundary.test.ts`. The shell imports from `src/core/index.ts` only. Tests drive this seam only.

## Layout
- `types.ts` shared types. `aim.ts` degrees per count, sphere geometry (`angleBetween`, `offsetAim`, `aimDelta`), FOV.
- `run.ts` the engine: `createRun(params)`, `replay`. `scenario.ts` what a Scenario implements (`Rules`).
- `scenarios/` `clicking.ts` (shared by Flick and Micro), `flick.ts`, `micro.ts`, `strafe.ts`, `switch.ts`, `wander.ts` (target motion
  for the Tracking Scenarios), `index.ts` (the registry, one line per Scenario).
- `analysis/` `analyseRun(run)`: Run Analysis, a union on Scenario category. It replays `input` to rebuild the crosshair path, so a
  `RunRecord` is all it needs. `clicking.ts` Aim Movements, Ideal Path and classification (#7); `tracking.ts` Ahead/Behind, Time on
  Target and mouse speed (#8, see Tracking Scenarios); `velocity.ts` smoothing, peaks and the thresholds (read its header before changing one).
- `rng.ts` `createRng(seed)`. `tally.ts` `tallyShots`. `testing/` bots and test params (tests only).
- `codec.ts` lossless binary form of `input` and `targetEvents` (+ base64). `storage.ts` the `RunStore` port (`save`, `list(filter)`
  summaries, `get`) and `createMemoryStore()` for tests. `exchange.ts` `exportData`/`importData`: one versioned JSON file, validated
  before any write, merged by Run id. The IndexedDB adapter is shell code in `src/storage/`. `testing/records.ts` `testRecord()` is a
  fully played record.
- `game-profiles.ts` the 7 Game Profiles (yaw, vertical setting, FOV, default Game Sensitivity, Clicking/Tracking weights, each
  value with its source), the Game Sensitivity <-> cm/360 formulas, the Converter (`convertSensitivity`, `readSensitivity`) and
  `profileFov(id)`, the `Fov` a Run renders with (always vertical, so a horizontal FOV on a 4:3 or 16:9 base is Hor+). `practiceFov(id, override)` is the Practice-only variant (Options' FOV override); the Sensitivity Finder must call `profileFov(id)`.
  A Game Profile id (`GameProfileId`) is what `RunMeta.gameProfileId` holds. Add a game by adding one entry to the table.
- `aggregate.ts` pure aggregators over `AnalysedRun = { run: RunSummary, analysis: RunAnalysis }`: `aggregateRuns(items)` pools per Scenario
  (rates recomputed from pooled counts, Warm-up Runs only counted in `warmups`), `groupRuns(items, keyOf)` for any grouping, with `bySession`
  and `byDay(items, dayOf)` on top (the shell supplies `dayOf`: the core has no time zone). `loadAnalysed(store, filter, cache?)` lists, loads and
  analyses Runs (15 to 70 ms per Run, Tracking Runs the most: pass a `Map` cache when you load more than once). `loadAnalysedRuns(store, summaries, cache?, onProgress?)` is the same for Runs already picked (the AI Coach analyses only `fit.counts.used`); `onProgress(done, total)` is awaited, so a screen can slice the work. `poolTracking` pools `TrackingMetrics` (= `TrackingAnalysis`) by sample count and Run length. Ticket #14/#15 reuse it on their own groupings.
- `finder/` the Session plan (`plan.ts`, #9) and the fit (`model.ts`, #10); see the two Finder sections below. Not here yet: fine phase and Reset (#11).
- `coach/` the AI Coach (ADR-0003), network-free. `provider.ts` is the port: `CoachProvider.complete({ system, prompt, json? })` returns the model's text
  (`json: { name, schema }` asks for a JSON reply: free text and structured are one call, so an operation never changes an adapter), and
  `CoachError` with a `kind` (`refusal | network | auth | rate-limit | malformed | provider`) whose message is written for the player.
  `advice.ts` `practiceAdvice(provider, { items, language })` builds the payload (`buildAdvicePayload`: `aggregateRuns` figures only, copied as
  numbers, so no Aim Movement list or input can get in) and one prompt, with the reply language in the system prompt. `json.ts` `askJson(provider,
  { system, prompt, name, schema })` is the structured operation: it states the schema in the prompt too, parses (a code fence is tolerated) and
  checks the reply against the schema (`schemaError`), throwing `malformed` otherwise. The Recommended Sensitivity (#15) is built on `askJson`
  (see the AI Coach section below). Adapters and the key store are shell code in `src/coach/`: no retry loops, one request per press.

## Conventions
- Units: degrees, ms since Run start, Sensitivity = cm/360. Yaw > 0 is right, pitch > 0 is up (crosshair pitch is clamped to
  +-89). The crosshair starts at yaw 0, pitch 0. Raw `move` counts use the DOM sign: dy > 0 is down. Button 0 fires.
- Sizes, distances and speeds are defined in degrees. `RunParams.fov` is recorded but must never affect targets or Score.
- `createRun(params).push(event)` takes `move | down | up | tick` events in time order (late ones are clamped). The first event
  at or after 30 000 ms ends the Run and is dropped. `state()` is live; `result()` (input, target events, Score) needs `done`.
- Simulated time advances in 1 ms steps (`Rules.step`) whatever the tick rate; ticks are not stored in a record.
- A persisted Run is `RunRecord = { ...params, ...meta, ...run.result() }`. The core never makes ids or reads a clock: the
  shell supplies `RunMeta` (`id`, `startedAt`, `gameProfileId`, `mode`, `warmup`, `sessionId`, absent only in Runs saved before Practice had Sessions, and `env`, absent only in old imports). `env` is the capture
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
  One exception to "what `Rules.step` saw": at the step where a Switch target falls, the state already shows its replacement, so
  the on-target test misses that ms. A `kill` event stamped at that step means it was on target (`analysis/tracking.ts` adds it).
- **Tracking Analysis (ticket #8):** `analyseRun` of a Strafe or Switch Run gives a `TrackingAnalysis`, read from one `replaySteps` pass.
  - `meanOffset` is Ahead/Behind: the mean signed offset in degrees of the crosshair from the target along its direction of travel
    (> 0 Ahead, < 0 Behind), never named Overshoot or Undershoot (those are Aim Movement outcomes). `lead` (`'ahead' | 'behind' |
    'level'`, not `'on-target'`) is `leadOf(meanOffset)`: a dead zone of 0.25 degrees (an eighth of the target radius) around 0 is level.
  - Which steps are sampled (`samples`): fire held, crosshair within 3 target radii of the nearest target, inside that window for 50 ms
    before and after the step (so the ends of a Switch flick are left out), target speed at least 2 deg/s. The reasoning and
    the measured numbers are in the header of `analysis/tracking.ts`. The window is wider than the radius on purpose: a
    laggard is outside the radius.
  - `timeOnTargetMs` and `timeOnTargetShare` (0 to 1) follow the Score rule exactly (fire held and crosshair within the radius), so
    `timeOnTargetShare * 100` is Strafe's Score and a Switch Run has at least 400 ms per fall. `mouseSpeed` is the smoothed crosshair
    speed in deg/s over the sampled steps (signed components smoothed, see `velocity.ts`).
  - Pooling several Runs (`aggregate.ts` `poolTracking`, shown on the Session summary and History): `meanOffset` and `mouseSpeed` weighted by
    `samples` (a zero-sample Run adds nothing), time on target as the sum of `timeOnTargetMs` over 30 000 ms per Run, and `leadOf` on the
    pooled mean so the dead zone stays in one place.

## Sensitivity Finder Session plan (`finder/plan.ts`)
- `planSession({ centre, levels, weights, seed }) => PlannedRun[]` (`{ scenario, seed, sensitivity, warmup }`), everything derived from the Session `seed`.
  `coarseLevels(centre)` is the coarse phase, `centre x 2^(k/3)` for k = -3 ... 3; `levels` is an input so the fine phase (#11) passes its own 5.
- Order: 2 Warm-up Runs (one per drawn Scenario, at `centre`, seeds of their own so the counted target sequence is not rehearsed), then
  each drawn Scenario once at every level, shuffled. All levels of a Scenario share one seed; the two Scenarios differ.
- Scenario draw: category by weight, then a Scenario of it uniformly, twice, skipping the first pick. With 2 Scenarios per category the long-run
  category share equals the weights exactly (the model in #10 re-weights by actual vs target share anyway).
- Saved Runs carry `mode: 'finder'`, `warmup`, `sessionId` and `levels` (levels per Scenario). A (Session, Scenario) pair is complete when it has
  `levels` non-warm-up Runs; an abandoned or quit Session leaves incomplete pairs for #10 to exclude. Run order within a Session is `startedAt`.
- The shell side (session loop, screens that never print a Sensitivity) is in `src/ui/finder.ts`.

## Sensitivity Finder fit (`finder/model.ts`, ticket #10)
`fitFinder(runs, { weights, exclude? }) => FinderFit`. Pure and deterministic, never throws. `runs` are the `RunSummary`s of ONE Game Profile (the caller
filters; `store.list({ gameProfileId, mode: 'finder' })` is enough, nothing needs analysing); `weights` is `getGameProfile(id).weights`. The fit itself drops
Warm-up Runs, Practice Runs, whatever `exclude(run)` names (Reset Finder, #11: `(r) => r.startedAt < resetAt`) and every (Session, Scenario) pair with fewer
counted Runs than `RunMeta.levels` (pairs are judged after `exclude`, so a Reset in the middle of a Session drops its pairs). Spec model, in this order:
- Score / the Scenario's standard deviation over ALL its fitted Runs (not per pair). Then scaled Score = quadratic in ln(Sensitivity) + run-order term (rank of
  the Run in its Session by `startedAt`) + an offset per (Session, Scenario) pair. The offsets are absorbed by demeaning every regressor AND the Score inside the
  pair, which equals explicit dummies (the brute-force `testing/reference-fit.ts` agrees to 1e-6). Demeaning only the Score is the biased shortcut the spec forbids.
- Weight per Run = (category target share) / (category share of the fitted Runs), once. Only categories that have Runs count, so **fit one category by passing only
  its Runs** (per-category curves, #11): the weights are then 1.
- Peak = vertex of the quadratic in cm/360, only if it is a maximum inside the tested range; else `peak: null`.

`FinderFit` fields:
- `peak: Cm360 | null`, `reason: null | 'insufficient-data' | 'no-interior-peak'`. `no-interior-peak` = the curve is a valley or its top lies outside `range`; then `curve`
  and `range` are still filled, and **the higher end of `curve.score` is the side to shift the Centre towards** (#11 owns the message and the shift).
  `insufficient-data` = nothing to fit, or too few Runs/levels to identify the curve (then `curve` is empty).
- `interval: { low, high, halfWidth } | null`: percentile bootstrap over Sessions, 2000 resamples (`BOOTSTRAP_RESAMPLES`), central 90% (`INTERVAL_LEVEL`), clamped to `range`,
  always containing `peak`. `halfWidth = (high - low) / 2 / peak`, so `halfWidth < 0.25` is the fine-phase switch and `halfWidth < 0.1` (`ENOUGH_HALF_WIDTH`) is `enoughData`.
  Null without a peak or with fewer than 2 Sessions (nothing to resample). The bootstrap is seeded from the fitted Runs (FNV-1a of their ids, Sensitivities and
  Scores), so the same data gives the same interval and #15 may cache on the Runs. A fit takes about 10 ms for 10 Sessions.
- **The interval is stretched.** Resampling few Sessions under-states the spread, so the percentile interval is widened about the peak by `sqrt(S/(S-1)) x t/z` (Student t on
  S-1 df over the normal, 95th percentiles). Plain percentiles covered the true optimum 73% of the time at 5 Sessions (nominal 90%); stretched, 88 to 89% from 5 to 12
  Sessions on the default synthetic player, whose intervals are about +-37% at 2 Sessions, +-13% at 5 and +-9.5% at 8: "enough data" arrives after roughly 8 to 12 coarse Sessions.
- `range`: tested Sensitivities `{ min, max }`. `curve: { sensitivity[], score[] }`: 61 log-spaced points over `range`; `score` is in Scenario spreads **relative to the top of the curve** (max 0).
  `points`: per distinct tested Sensitivity, the mean scaled Score with pair offsets and run order taken out, on the same axis as `curve` (the partial residuals).
- `coefficients`: slopes in x = (ln c - centre) / halfRange, so `range` is x in [-1, 1]; `offsets`: per pair, the scaled Score at the top of the curve at Session start;
  `spread`: the divisor of each Scenario; `counts`: Sessions, pairs, Runs used and Runs excluded by cause.
- `counts.used` is the Runs the fit used (Warm-up Runs, Practice Runs, `exclude`d Runs and incomplete pairs already out, so Reset applies by itself), in id order: the AI Coach payload and its snapshot key read these, not a selection of their own.
- `recommend(fit, coach?)` is the seam of #15: the AI Coach's choice (`Recommendation`, `source: 'coach'`) when it lies inside `fit.interval`, else the Curve Peak.

Synthetic players (`testing/synthetic.ts`, tests only, also for #11): `syntheticPlayer({ optimum, curvature, noise, trend, form, warmupPenalty, scenarios })` and
`syntheticRuns(player, sessions, seed)` make `RunSummary`s without the engine. Score = level + scale x (-curvature x ln(c / optimum)^2 + trend x order + form + noise); `form` is one draw
per (Session, Scenario) pair, `noise` one per Run, all derived from `seed`. A session is `{ levels, scenarios?, abandonAfter?, centre? }`: 2 Warm-up Runs (penalised) then every
Scenario at every level, shuffled; `abandonAfter: n` keeps only the first n counted Runs while `RunMeta.levels` still says the plan (an incomplete pair). Give a Scenario its own
`optimum` to make categories disagree. Scenarios that share a curve shape on mirrored levels pool to the exact weighted mean of their optima (see the category weighting tests).

## AI Coach: the Recommended Sensitivity (`coach/sensitivity.ts`, ticket #15)
`recommendSensitivity({ provider, fit, items, profile, context, language, model, cache })` returns `{ recommended: cm/360 | null, source: 'coach' | 'curve-peak', reasons, notice?, snapshotKey }`. The shell calls it
only when the player presses the button (never on load). `items` are `AnalysedRun`s; only those in `fit.counts.used` are read. Game Sensitivity and eDPI are never asked: the screen works them out from the cm/360 (`resultView`).
- **No call** (the Curve Peak, or `recommended: null` without a peak, no `notice`): no provider, no Curve Peak, or no interval (one Session). Then `recommend` is the Curve Peak.
- **Payload** (`buildSensitivityPayload`, aggregates only: `figuresOf` copies numbers and nothing else, so Aim Movement lists, `input`, `targetEvents` and `env` cannot get in; a test walks the keys at every depth): `units` (what each number is, cm/360 first),
  the Game Profile (name and weights), Player Context as fixed phrases, the Curve Peak, the interval (rounded inward to 2 decimals, so a copied bound is inside), 13 samples of the Performance Curve and the **levels**. Sessions play different
  Sensitivities, so the tested range is cut into 9 log-spaced bins; the Runs of a bin, from any Session, are pooled with `groupRuns`, named by their geometric mean cm/360, and empty bins are left out: at most 9 levels, so the size does not grow with the number of Runs.
  Per level and Scenario: Runs, `scaledScore` (mean Score over `fit.spread`, the fit's own scaling, not adjusted for Session form: the curve is) and Overshoot/Undershoot rates, Path Deviation, Smoothness, accuracy (Clicking) or Ahead/Behind, Time on Target (Tracking).
- **Player Context** (`coach/context.ts`): role, mousepad, aiming, each one of a few fixed choices or absent. `parsePlayerContext` drops anything else, in the core, so a hand-edited save cannot put text in the prompt. The reply language goes through `cleanLanguage` (one short line).
- **Request**: `askJson` with `{ recommendedCm360, reasons }`. No `maxItems`/`maxLength` in the schema (structured-output endpoints reject them): reasons are trimmed and bounded after parsing (5, 400 characters), a non-positive number or no reasons is `malformed`.
- **Guardrail**: an answer outside `[interval.low, interval.high]` is asked again once with a reminder naming the interval; a second miss falls back to the Curve Peak with a `notice`. Refusal, any error and malformed output fall back at once, never retried.
- **Cache** (`ChoiceCache` port, `createChoiceCache`; the app keeps it in localStorage, `src/coach/choice-cache.ts`, last 5): key = `snapshotKey` = prompt version, Game Profile, the fitted Runs (count and hash of id, Sensitivity, Score: any new Run changes it,
  a Reset too, a Warm-up Run or an unfinished pair does not), Player Context, language and `model` (the shell's provider + model + endpoint, never the API key). Only an accepted AI Coach answer is cached: a fallback of any kind, a guardrail miss included, is not, so the next press asks again.
  `cachedRecommendation(...)` reads it without a provider call and without any Analysis: the result screen uses it when it opens, so the same data keeps the same number after a reload.
- Tests use `testing/fake-provider.ts` (`fakeProvider(...replies)`, records requests) and `testing/analysis.ts` (`analysedSynthetic(runs)`: stand-in Analyses for `syntheticRuns`, with Aim Movement lists a leak would show).

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
are jerky, `bow` bends it sideways. Analysis tests (`analysis/clicking.test.ts`, `analysis/tracking.test.ts`) run bots at several Sensitivity/DPI settings.

`trackBot({ leadMs })` is the Tracking bot: it holds fire and keeps the crosshair on the first of `state.targets`, staying on that
target until it is gone. `leadMs` aims that many ms of the target's travel ahead of it (> 0, Ahead) or behind it (< 0, Behind);
0 is dead on. Build a leading or lagging bot with `trackBot({ leadMs: 100 })` / `trackBot({ leadMs: -100 })`.

## Determinism rules
- Randomness only from `createRng(seed)`, with a number of draws that does not depend on input (Finder Runs share a seed
  across Sensitivities). Time only from event `t`. No `Date`, no `Math.random`, no iteration order that depends on input.
- Keep geometry in degrees on the sphere (`angleBetween`), never flat yaw/pitch distance.
