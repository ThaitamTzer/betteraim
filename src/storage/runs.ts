import type { RunRecord, RunStore } from '../core'
import { openRunStore } from './idb'

let opened: Promise<RunStore> | undefined
/** The one RunStore of the app, opened on first use. */
export const runStore = (): Promise<RunStore> => (opened ??= openRunStore())

// shortcut: one settled promise per Run saved from this tab, never removed (the Result screen reads only the latest); tiny, but clear entries once read if a tab ever lives for days.
const saves = new Map<string, Promise<void>>()

/** Saves a finished Run in the background. The Result screen reads the outcome with `saveOutcome`. */
export function saveRun(record: RunRecord): void {
  const saving = runStore().then((store) => store.save([record]))
  saving.catch((error) => console.error('Could not save the Run', error)) // also marks it handled
  saves.set(record.id, saving)
}

/** Resolves when the Run with this id is saved, rejects if it could not be; undefined if it was never saved from here. */
export const saveOutcome = (id: string): Promise<void> | undefined => saves.get(id)
