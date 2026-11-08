import { useEffect, useState } from 'react'
import { loadAnalysed } from '../core'
import type { AnalysedRun } from '../core'
import { runStore } from '../storage/runs'

export type Loaded = { items: AnalysedRun[] } | { error: string } | null

/** The stored Runs, analysed (all of them, or one Session's); null while loading. Reloads when `sessionId` changes. */
export function useAnalysed(sessionId?: string): Loaded {
  const [loaded, setLoaded] = useState<Loaded>(null)
  useEffect(() => {
    let current = true
    runStore()
      .then((store) => loadAnalysed(store, sessionId === undefined ? undefined : { sessionId }))
      .then(
        (items) => current && setLoaded({ items }),
        (error: unknown) => current && setLoaded({ error: error instanceof Error ? error.message : String(error) }),
      )
    return () => {
      current = false
    }
  }, [sessionId])
  return loaded
}
