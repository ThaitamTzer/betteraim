import { describe, expect, it } from 'vitest'
import { loadAnalysed } from '../aggregate'
import { createMemoryStore } from '../storage'
import type { RunStore, RunSummary } from '../storage'
import { testRecord } from '../testing/records'
import { syntheticPlayer, syntheticRuns } from '../testing/synthetic'
import type { SyntheticSession } from '../testing/synthetic'
import type { RunRecord } from '../types'
import { fitCategories } from './categories'
import { fitFinder } from './model'
import { coarseLevels } from './plan'
import { finderRunsFor } from './reset'

const WEIGHTS = { clicking: 0.7, tracking: 0.3 }
const DAY = 86_400_000
const coarse = (n: number): SyntheticSession[] => Array.from({ length: n }, () => ({ levels: coarseLevels(40) }))

const base = testRecord()
const record = (summary: RunSummary, gameProfileId = summary.gameProfileId): RunRecord => ({ ...base, ...summary, gameProfileId })
const storeWith = async (summaries: RunSummary[]): Promise<RunStore> => {
  const store = createMemoryStore()
  await store.save(summaries.map((s) => record(s)))
  return store
}
/** Valorant Finder Runs: 8 Sessions, one a day, so a Reset at day N cuts between Sessions. */
const runs = syntheticRuns(syntheticPlayer({ optimum: 33 }), coarse(8), 5)

describe('Reset Finder', () => {
  it('leaves all earlier Runs out of the fit, as if only the later ones had been played', async () => {
    const store = await storeWith(runs)
    await store.resetFinder('valorant', 3 * DAY - 1) // Sessions 3 to 7 are after it
    const { runs: all, exclude } = await finderRunsFor(store, 'valorant')
    const fit = fitFinder(all, { weights: WEIGHTS, exclude })
    const later = fitFinder(runs.filter((r) => r.startedAt >= 3 * DAY - 1), { weights: WEIGHTS })

    expect(fit.counts).toMatchObject({ sessions: 5, runs: 70, excluded: { filtered: 42 } }) // a Session is 2 pairs x 7 levels (its Warm-up Runs are counted as such)
    expect(fit.peak).toBeCloseTo(later.peak!, 9)
    expect(fit.interval).toEqual(later.interval)
    expect(fit.curve).toEqual(later.curve)
  })

  it('keeps the earlier Runs in the store, whole and analysable, since only the fit leaves them out', async () => {
    const store = await storeWith(runs)
    await store.resetFinder('valorant', 10 * DAY)
    expect(await store.list()).toHaveLength(runs.length)
    const early = runs.find((r) => !r.warmup && r.scenario === 'flick')!
    expect(await store.get(early.id)).toEqual(record(early))
    // Analysis, History and Past Runs read the store, not the fit's selection
    const analysed = await loadAnalysed(store, { gameProfileId: 'valorant', since: early.startedAt, until: early.startedAt })
    expect(analysed.map((a) => a.run.id)).toEqual([early.id])
  })

  it('shows an empty fit straight after, and counts the first Session played after it', async () => {
    const store = await storeWith(runs)
    await store.resetFinder('valorant', 10 * DAY)
    const empty = await finderRunsFor(store, 'valorant')
    expect(fitFinder(empty.runs, { weights: WEIGHTS, exclude: empty.exclude })).toMatchObject({ peak: null, reason: 'insufficient-data', counts: { runs: 0 } })

    const fresh = syntheticRuns(syntheticPlayer({ optimum: 33 }), coarse(2), 6).map((r): RunSummary => ({ ...r, startedAt: r.startedAt + 10 * DAY }))
    await store.save(fresh.map((s) => record(s)))
    const after = await finderRunsFor(store, 'valorant')
    expect(fitFinder(after.runs, { weights: WEIGHTS, exclude: after.exclude }).counts).toMatchObject({ sessions: 2, runs: 28 })
  })

  it('counts a Run that started at the marker itself (only earlier Runs are excluded)', async () => {
    const store = await storeWith(runs)
    await store.resetFinder('valorant', 3 * DAY)
    const { exclude } = await finderRunsFor(store, 'valorant')
    const first = runs.filter((r) => r.startedAt === 3 * DAY)
    expect(first).toHaveLength(1)
    expect(exclude(first[0]!)).toBe(false)
    expect(exclude(runs.filter((r) => r.startedAt < 3 * DAY).at(-1)!)).toBe(true)
  })

  it('is per Game Profile and only for its own Finder Runs', async () => {
    const cs2 = runs.map((r): RunSummary => ({ ...r, id: `cs2-${r.id}`, gameProfileId: 'cs2' }))
    const practice = runs.slice(0, 5).map((r): RunSummary => ({ ...r, id: `p-${r.id}`, mode: 'practice' }))
    const store = await storeWith([...runs, ...cs2, ...practice])
    await store.resetFinder('valorant', 10 * DAY)

    const valorant = await finderRunsFor(store, 'valorant')
    expect(valorant.runs).toHaveLength(runs.length) // not CS2's, not the Practice Runs
    expect(valorant.runs.every((r) => r.gameProfileId === 'valorant' && r.mode === 'finder')).toBe(true)
    expect(valorant.runs.every(valorant.exclude)).toBe(true)

    const other = await finderRunsFor(store, 'cs2')
    expect(other.runs).toHaveLength(runs.length)
    expect(other.runs.some(other.exclude)).toBe(false)
    expect(fitFinder(other.runs, { weights: WEIGHTS, exclude: other.exclude }).counts.sessions).toBe(8)
  })

  it('excludes nothing when the Game Profile was never reset', async () => {
    const { runs: all, exclude, resetAt } = await finderRunsFor(await storeWith(runs), 'valorant')
    expect(resetAt).toBeUndefined()
    expect(all.some(exclude)).toBe(false)
  })
})

describe('per-category curves', () => {
  // Clicking Scenarios (Flick) peak at 30 cm/360, Tracking (Strafe) at 60: the two categories disagree.
  const player = syntheticPlayer({
    optimum: 40,
    noise: 0.1,
    scenarios: { ...syntheticPlayer().scenarios, flick: { baseline: 60, scale: 20, optimum: 30 }, strafe: { baseline: 55, scale: 12, optimum: 60 } },
  })
  const both = syntheticRuns(player, coarse(10), 3)

  it('are each the fit of that category\'s Runs alone, with no weighting', () => {
    const { clicking, tracking } = fitCategories(both, { weights: WEIGHTS })
    const click = both.filter((r) => r.scenario === 'flick' || r.scenario === 'micro')
    expect(click.length).toBeGreaterThan(0)
    expect(clicking).toEqual(fitFinder(click, { weights: WEIGHTS }))
    expect(tracking).toEqual(fitFinder(both.filter((r) => r.scenario === 'strafe' || r.scenario === 'switch'), { weights: WEIGHTS }))
  })

  it('recover each category\'s own optimum, which the combined curve sits between', () => {
    const { clicking, tracking } = fitCategories(both, { weights: WEIGHTS })
    expect(clicking.peak).toBeCloseTo(30, -0.5)
    expect(tracking.peak).toBeCloseTo(60, -1)
    const combined = fitFinder(both, { weights: WEIGHTS })
    expect(combined.peak).toBeGreaterThan(clicking.peak!)
    expect(combined.peak).toBeLessThan(tracking.peak!)
  })

  it('honour the Reset like the combined fit, and say when a category has too little data', () => {
    const only = syntheticRuns(syntheticPlayer(), coarse(4), 8).filter((r) => r.scenario === 'flick')
    const { clicking, tracking } = fitCategories(only, { weights: WEIGHTS, exclude: (r) => r.startedAt < 2 * DAY })
    expect(clicking.counts.sessions).toBe(2)
    expect(tracking).toMatchObject({ peak: null, reason: 'insufficient-data', counts: { runs: 0 } })
  })
})
