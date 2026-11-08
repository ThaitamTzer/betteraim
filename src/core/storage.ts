import { decodeInput, decodeTargetEvents, encodeInput, encodeTargetEvents } from './codec'
import type { GameProfileId } from './game-profiles'
import type { RunMode, RunRecord } from './types'

/** A Run without its bulky parts: all that the Finder fit and History lists need. */
export type RunSummary = Omit<RunRecord, 'input' | 'targetEvents'>

/** The bulky parts of a Run in their compact binary form (see codec.ts). Adapters store these next to the summary. */
export interface RunBody {
  input: Uint8Array
  targetEvents: Uint8Array
}

/** Every field is optional and they combine with AND. `since` and `until` bound `startedAt`, both inclusive. */
export interface RunFilter {
  gameProfileId?: GameProfileId
  mode?: RunMode
  sessionId?: string
  warmup?: boolean
  since?: number
  until?: number
}

/**
 * Where Runs live. Adapters: IndexedDB in the app (src/storage), `createMemoryStore` for tests.
 * Callers see whole records; adapters keep the input and target events as binary (`packRun`/`unpackRun`).
 */
export interface RunStore {
  /** Inserts or replaces by `id`. All records are written or none are. */
  save(records: readonly RunRecord[]): Promise<void>
  /** Summaries, oldest first (`startedAt`, then `id`). Never loads input or target events. */
  list(filter?: RunFilter): Promise<RunSummary[]>
  get(id: string): Promise<RunRecord | undefined>
  /** Reset Finder markers (see `FinderResets`). They live beside the Runs, so an export carries them. */
  finderResets(): Promise<FinderResets>
  /** Resets the Finder of a Game Profile at `at`. A later marker already stored is kept, so a reset is never undone by an older one (an import). */
  resetFinder(gameProfileId: GameProfileId, at: number): Promise<void>
}

/** Per Game Profile id, the time (`startedAt` scale) before which Finder Runs are left out of the fit (Reset Finder, #11). The Runs themselves stay. */
export type FinderResets = Partial<Record<GameProfileId, number>>

export function packRun(record: RunRecord): { summary: RunSummary; body: RunBody } {
  const { input, targetEvents, ...summary } = record
  return { summary, body: { input: encodeInput(input), targetEvents: encodeTargetEvents(targetEvents) } }
}

export function unpackRun(summary: RunSummary, body: RunBody): RunRecord {
  return { ...summary, input: decodeInput(body.input), targetEvents: decodeTargetEvents(body.targetEvents) }
}

/** Applies a filter and the `list` order. Adapters that cannot filter natively (IndexedDB scan) share this. */
export function selectRuns(all: readonly RunSummary[], f: RunFilter = {}): RunSummary[] {
  return all
    .filter(
      (r) =>
        (f.gameProfileId === undefined || r.gameProfileId === f.gameProfileId) &&
        (f.mode === undefined || r.mode === f.mode) &&
        (f.sessionId === undefined || r.sessionId === f.sessionId) &&
        (f.warmup === undefined || r.warmup === f.warmup) &&
        (f.since === undefined || r.startedAt >= f.since) &&
        (f.until === undefined || r.startedAt <= f.until),
    )
    .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function createMemoryStore(): RunStore {
  const runs = new Map<string, { summary: RunSummary; body: RunBody }>()
  const resets = new Map<GameProfileId, number>()
  return {
    finderResets: async () => Object.fromEntries(resets) as FinderResets,
    async resetFinder(gameProfileId, at) {
      resets.set(gameProfileId, Math.max(at, resets.get(gameProfileId) ?? at))
    },
    async save(records) {
      const packed = records.map(packRun) // encode everything first: a failure leaves the store untouched
      for (const p of packed) runs.set(p.summary.id, p)
    },
    // shortcut: summaries are shared with callers, not copied (IndexedDB copies); fine while callers only read
    list: async (filter) => selectRuns([...runs.values()].map((r) => r.summary), filter),
    async get(id) {
      const found = runs.get(id)
      return found && unpackRun(found.summary, found.body)
    },
  }
}
