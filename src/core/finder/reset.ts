import type { GameProfileId } from '../game-profiles'
import type { RunStore, RunSummary } from '../storage'

/**
 * Reset Finder (spec #1): the Runs a Game Profile's fit and Recommended Sensitivity are made from. THE ONE place that applies a reset marker;
 * the Finder result, the next Session's plan and the AI Coach's payload (#15) all take their Runs from here, so they never disagree.
 *
 * - `runs`: every Finder Run of the Game Profile, reset or not (`fitFinder` wants them all: a gap left by an excluded Run is real time).
 * - `exclude`: the predicate for `fitFinder`'s `exclude` option: true for Runs that started before the marker. Anything else that reads the
 *   fit's Runs (the AI Coach) uses `runs.filter((r) => !exclude(r))`, or `resetAt` as the `since` of a `RunFilter` to avoid loading the rest.
 * - `resetAt`: the marker, undefined when the Game Profile was never reset.
 *
 * The excluded Runs are untouched in the store: Analysis, History and Past Runs still see them.
 */
export async function finderRunsFor(
  store: RunStore,
  gameProfileId: GameProfileId,
): Promise<{ runs: RunSummary[]; exclude: (run: RunSummary) => boolean; resetAt: number | undefined }> {
  const resetAt = (await store.finderResets())[gameProfileId]
  return { runs: await store.list({ gameProfileId, mode: 'finder' }), exclude: (run) => resetAt !== undefined && run.startedAt < resetAt, resetAt }
}
