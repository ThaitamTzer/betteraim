import { fromBase64, toBase64 } from './codec'
import { packRun, unpackRun } from './storage'
import type { FinderResets, RunStore, RunSummary } from './storage'
import type { RunMode, RunRecord, ScenarioId } from './types'

// The export is ONE JSON file: { format, version, runs: [{ ...summary, input, targetEvents }] } where `input` and
// `targetEvents` are the binary codec output as base64 text. A change that old readers cannot understand bumps
// EXPORT_VERSION; importers reject any version they do not know. Later data adds keys beside `runs`.
// `finderResets` ({ [Game Profile id]: time }, Reset Finder #11) and `player` (the player's setup, see `PlayerData`) are such keys: optional,
// absent from files of players who never reset / from files written before they existed, which therefore import with none.
// A change that only adds an optional key does not bump the version.
export const EXPORT_FORMAT = 'betteraim-export'
export const EXPORT_VERSION = 1

/** The file cannot be imported. The message is meant for the player. */
export class ImportError extends Error {}

/**
 * The player's setup as the shell keeps it (Game Profile, Game Sensitivity and DPI, Preferences, Player Context): a JSON record the core only
 * carries, so that the Runs, the Reset markers and the setup move between browsers in one file. The shell makes it and validates it on the way
 * in (`importData`'s `validatePlayer`). NEVER the AI Coach's settings: they hold API keys and stay in their browser.
 */
export type PlayerData = Record<string, unknown>

export async function exportData(store: RunStore, player?: PlayerData): Promise<string> {
  const runs = []
  for (const { id } of await store.list()) {
    const record = await store.get(id)
    if (!record) continue
    const { summary, body } = packRun(record)
    runs.push({ ...summary, input: toBase64(body.input), targetEvents: toBase64(body.targetEvents) })
  }
  const finderResets = await store.finderResets()
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, runs, ...(Object.keys(finderResets).length > 0 && { finderResets }), ...(player && { player }) })
}

export interface ImportResult<T extends PlayerData = PlayerData> {
  /** The number of Runs in the file. */
  runs: number
  /** The player's setup as `validatePlayer` returned it, for the shell to apply; undefined when the file has none. The core never applies it. */
  player: T | undefined
}

/**
 * Adds the Runs in an export file to the store (a Run with a known id is replaced, nothing is deleted, so importing
 * the same file twice changes nothing; a Reset Finder marker keeps the later of the two times). The whole file is validated first, the player's
 * setup included (`validatePlayer` throws `ImportError` for a setup it does not accept, or returns the record to keep), and the Runs
 * are written in one `save`: a bad file never touches existing data. The port has no write that spans Runs and markers, so Runs go first:
 * if the markers then fail, importing the file again completes it, whereas markers first could leave a Reset applied with no Runs behind it
 * (a Reset is permanent). The shell applies the returned setup last, once everything is stored.
 */
export async function importData(store: RunStore, text: string): Promise<ImportResult>
export async function importData<T extends PlayerData>(store: RunStore, text: string, validatePlayer: (player: PlayerData) => T): Promise<ImportResult<T>>
export async function importData(store: RunStore, text: string, validatePlayer: (player: PlayerData) => PlayerData = (player) => player): Promise<ImportResult> {
  const { runs, finderResets, player } = parseExport(text)
  const accepted = player && accept(validatePlayer, player)
  await store.save(runs)
  for (const [gameProfileId, at] of Object.entries(finderResets)) await store.resetFinder(gameProfileId, at)
  return { runs: runs.length, player: accepted }
}

function accept(validate: (player: PlayerData) => PlayerData, player: PlayerData): PlayerData {
  try {
    return validate(player)
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError(error instanceof Error ? error.message : 'The setup in the file is not valid.')
  }
}

export function parseExport(text: string): { runs: RunRecord[]; finderResets: FinderResets; player: PlayerData | undefined } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    fail('The file is not valid JSON.')
  }
  if (!isObj(file) || file.format !== EXPORT_FORMAT) fail('This is not a BetterAim export file.')
  if (file.version !== EXPORT_VERSION) {
    fail(`This file is export version ${String(file.version)}; this app reads version ${EXPORT_VERSION}.`)
  }
  if (!Array.isArray(file.runs)) fail('The file has no list of Runs.')
  const runs = file.runs.map((run: unknown, i) => {
    try {
      return parseRun(run)
    } catch (error) {
      throw new ImportError(`Run ${i + 1}: ${error instanceof Error ? error.message : 'invalid'}`)
    }
  })
  return { runs, finderResets: parseResets(file.finderResets), player: file.player === undefined ? undefined : isObj(file.player) ? file.player : fail('"player" must be an object.') }
}

function parseResets(raw: unknown): FinderResets {
  if (raw === undefined) return {} // files from before Reset Finder, or from a player who never reset
  if (!isObj(raw)) fail('"finderResets" must be an object.')
  return Object.fromEntries(Object.entries(raw).map(([id, at]) => [id, isNum(at) ? at : fail(`Reset marker "${id}" must be a number.`)]))
}

type Obj = Record<string, unknown>

function fail(message: string): never {
  throw new ImportError(message)
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isNum(v) && v > 0
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isText = (v: unknown): v is string => typeof v === 'string'
const isId = (v: unknown): v is string => isText(v) && v !== ''
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T)

// A Record over the union makes this fail to compile when a ScenarioId is added without being accepted here.
const SCENARIO_IDS: Record<ScenarioId, true> = { flick: true, micro: true, strafe: true, switch: true }
const isScenario = (v: unknown): v is ScenarioId => isText(v) && Object.hasOwn(SCENARIO_IDS, v)

function field<T>(o: Obj, key: string, valid: (v: unknown) => v is T, what: string): T {
  const v = o[key]
  return valid(v) ? v : fail(`"${key}" must be ${what}.`)
}

function parseRun(raw: unknown): RunRecord {
  if (!isObj(raw)) fail('it is not an object.')
  const fov = field(raw, 'fov', isObj, 'an object')
  const env = raw.env === undefined ? undefined : field(raw, 'env', isObj, 'an object')
  // fields are copied one by one, so nothing unexpected from the file ever reaches the store
  const summary: RunSummary = {
    scenario: field(raw, 'scenario', isScenario, 'a known Scenario'),
    seed: field(raw, 'seed', isNum, 'a number'),
    sensitivity: field(raw, 'sensitivity', isPositive, 'a positive number'),
    dpi: field(raw, 'dpi', isPositive, 'a positive number'),
    fov: {
      degrees: field(fov, 'degrees', isPositive, 'a positive number'),
      axis: field(fov, 'axis', oneOf('horizontal', 'vertical'), 'horizontal or vertical'),
    },
    id: field(raw, 'id', isId, 'text'),
    startedAt: field(raw, 'startedAt', isNum, 'a number'),
    gameProfileId: field(raw, 'gameProfileId', isText, 'text'),
    mode: field(raw, 'mode', oneOf<RunMode>('finder', 'practice'), 'finder or practice'),
    warmup: field(raw, 'warmup', isBool, 'true or false'),
    ...(raw.sessionId === undefined ? {} : { sessionId: field(raw, 'sessionId', isText, 'text') }), // absent in Practice
    ...(env && {
      env: {
        devicePixelRatio: field(env, 'devicePixelRatio', isPositive, 'a positive number'),
        userAgent: field(env, 'userAgent', isText, 'text'),
        rawInput: field(env, 'rawInput', isBool, 'true or false'),
      },
    }),
    ...(raw.levels === undefined ? {} : { levels: field(raw, 'levels', isCount, 'a whole number above 0') }), // Finder Runs only
    score: field(raw, 'score', isNum, 'a number'),
  }
  try {
    return unpackRun(summary, {
      input: fromBase64(field(raw, 'input', isText, 'base64 text')),
      targetEvents: fromBase64(field(raw, 'targetEvents', isText, 'base64 text')),
    })
  } catch (error) {
    if (error instanceof ImportError) throw error
    return fail('its input or target events are damaged.')
  }
}
