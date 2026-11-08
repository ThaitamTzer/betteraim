import { packRun, selectRuns, unpackRun } from '../core'
import type { RunBody, RunStore, RunSummary } from '../core'

// Two object stores so that listing never loads the ~400 kB binary body of every Run.
const SUMMARIES = 'runs'
const BODIES = 'bodies'

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
    const opening = indexedDB.open(name, 1)
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(SUMMARIES, { keyPath: 'id' })
      opening.result.createObjectStore(BODIES, { keyPath: 'id' })
    }
    opening.onerror = () => reject(opening.error)
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
