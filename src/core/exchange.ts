import { fromBase64, toBase64 } from './codec'
import { packRun, unpackRun } from './storage'
import type { RunStore, RunSummary } from './storage'
import type { RunMode, RunRecord, ScenarioId } from './types'

// The export is ONE JSON file: { format, version, runs: [{ ...summary, input, targetEvents }] } where `input` and
// `targetEvents` are the binary codec output as base64 text. A change that old readers cannot understand bumps
// EXPORT_VERSION; importers reject any version they do not know. Later data (options, Finder state) adds keys beside `runs`.
export const EXPORT_FORMAT = 'betteraim-export'
export const EXPORT_VERSION = 1

/** The file cannot be imported. The message is meant for the player. */
export class ImportError extends Error {}

export async function exportData(store: RunStore): Promise<string> {
  const runs = []
  for (const { id } of await store.list()) {
    const record = await store.get(id)
    if (!record) continue
    const { summary, body } = packRun(record)
    runs.push({ ...summary, input: toBase64(body.input), targetEvents: toBase64(body.targetEvents) })
  }
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, runs })
}

/**
 * Adds the Runs in an export file to the store (a Run with a known id is replaced, nothing is deleted, so importing
 * the same file twice changes nothing). The whole file is validated first and written in one `save`: a bad file
 * never touches existing data. Returns the number of Runs in the file.
 */
export async function importData(store: RunStore, text: string): Promise<number> {
  const records = parseExport(text)
  await store.save(records)
  return records.length
}

export function parseExport(text: string): RunRecord[] {
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
  return file.runs.map((run: unknown, i) => {
    try {
      return parseRun(run)
    } catch (error) {
      throw new ImportError(`Run ${i + 1}: ${error instanceof Error ? error.message : 'invalid'}`)
    }
  })
}

type Obj = Record<string, unknown>

function fail(message: string): never {
  throw new ImportError(message)
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isNum(v) && v > 0
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
  const env = field(raw, 'env', isObj, 'an object')
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
    env: {
      devicePixelRatio: field(env, 'devicePixelRatio', isPositive, 'a positive number'),
      userAgent: field(env, 'userAgent', isText, 'text'),
      rawInput: field(env, 'rawInput', isBool, 'true or false'),
    },
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
