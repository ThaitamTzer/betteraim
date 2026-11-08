import { packRun, selectRuns, unpackRun } from '../core'
import type { FinderResets, RunBody, RunStore, RunSummary } from '../core'

// Two object stores so that listing never loads the ~400 kB binary body of every Run.
const SUMMARIES = 'runs'
const BODIES = 'bodies'
// Reset Finder markers, one { id: Game Profile id, at } per Game Profile. Added in version 2; Runs are untouched by the upgrade.
const RESETS = 'finderResets'

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
  })

/** The app's RunStore, backed by IndexedDB. Not unit-tested (no IndexedDB in Node); the memory adapter covers the port. */
export function openRunStore(name = 'betteraim'): Promise<RunStore> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, 2)
    opening.onupgradeneeded = () => {
      const names = opening.result.objectStoreNames
      if (!names.contains(SUMMARIES)) opening.result.createObjectStore(SUMMARIES, { keyPath: 'id' })
      if (!names.contains(BODIES)) opening.result.createObjectStore(BODIES, { keyPath: 'id' })
      if (!names.contains(RESETS)) opening.result.createObjectStore(RESETS, { keyPath: 'id' })
    }
    opening.onerror = () => reject(opening.error)
    // Version 2 cannot open while an older BetterAim tab still holds version 1; say so instead of hanging.
    opening.onblocked = () => reject(new Error('Another BetterAim tab is using an older version of your data. Close it and reload this page.'))
    opening.onsuccess = () => {
      const db = opening.result
      resolve({
        async save(records) {
          const packed = records.map(packRun) // encode before opening the transaction so it cannot go stale
          const tx = db.transaction([SUMMARIES, BODIES], 'readwrite')
          for (const { summary, body } of packed) {
            tx.objectStore(SUMMARIES).put(summary)
            tx.objectStore(BODIES).put({ id: summary.id, ...body })
          }
          await finished(tx)
        },
        // shortcut: scans every summary and filters in memory; add indexes if Runs reach the tens of thousands
        async list(filter) {
          const all = await request<RunSummary[]>(db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll())
          return selectRuns(all, filter)
        },
        async finderResets() {
          const all = await request<{ id: string; at: number }[]>(db.transaction(RESETS).objectStore(RESETS).getAll())
          return Object.fromEntries(all.map(({ id, at }): [string, number] => [id, at])) as FinderResets
        },
        async resetFinder(gameProfileId, at) {
          const tx = db.transaction(RESETS, 'readwrite')
          const store = tx.objectStore(RESETS)
          const stored = store.get(gameProfileId) // read and write in one transaction: the later marker wins even against a concurrent import
          stored.onsuccess = () => {
            const current = (stored.result as { at: number } | undefined)?.at
            if (current === undefined || current < at) store.put({ id: gameProfileId, at })
          }
          await finished(tx)
        },
        async get(id) {
          const tx = db.transaction([SUMMARIES, BODIES])
          const [summary, body] = await Promise.all([
            request<RunSummary | undefined>(tx.objectStore(SUMMARIES).get(id)),
            request<RunBody | undefined>(tx.objectStore(BODIES).get(id)),
          ])
          return summary && body && unpackRun(summary, body)
        },
      })
    }
  })
}
