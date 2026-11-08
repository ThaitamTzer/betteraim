import { describe, expect, it } from 'vitest'
import { createMemoryStore } from './index'
import { testRecord } from './testing/records'

describe('run store', () => {
  it('gets back exactly what was saved, including input and target events', async () => {
    const store = createMemoryStore()
    const record = testRecord()
    await store.save([record])
    expect(await store.get(record.id)).toEqual(record)
    expect(await store.get('nope')).toBeUndefined()
  })

  it('saving an id again replaces that Run', async () => {
    const store = createMemoryStore()
    await store.save([testRecord({ seed: 1 }, { id: 'a' })])
    const replacement = testRecord({ seed: 2 }, { id: 'a' })
    await store.save([replacement])
    expect(await store.get('a')).toEqual(replacement)
    expect(await store.list()).toHaveLength(1)
  })

  it('lists summaries without the bulky input, oldest first', async () => {
    const store = createMemoryStore()
    const late = testRecord({}, { id: 'late', startedAt: 300 })
    const early = testRecord({}, { id: 'early', startedAt: 100 })
    await store.save([late, early])
    const list = await store.list()
    expect(list.map((r) => r.id)).toEqual(['early', 'late'])
    expect(list[0]).not.toHaveProperty('input')
    expect(list[0]).not.toHaveProperty('targetEvents')
    expect(list[0]?.score).toBe(early.score)
    expect(list[0]?.env).toEqual(early.env)
  })

  it('filters by Game Profile, mode, Session id, Warm-up flag and time', async () => {
    const store = createMemoryStore()
    await store.save([
      testRecord({}, { id: 'a', startedAt: 100, gameProfileId: 'cs2', mode: 'finder', warmup: true, sessionId: 's1' }),
      testRecord({}, { id: 'b', startedAt: 200, gameProfileId: 'cs2', mode: 'finder', warmup: false, sessionId: 's1' }),
      testRecord({}, { id: 'c', startedAt: 300, gameProfileId: 'valorant', mode: 'practice', warmup: false, sessionId: 's2' }),
    ])
    const ids = async (filter: Parameters<typeof store.list>[0]) => (await store.list(filter)).map((r) => r.id)
    expect(await ids({ gameProfileId: 'cs2' })).toEqual(['a', 'b'])
    expect(await ids({ mode: 'practice' })).toEqual(['c'])
    expect(await ids({ sessionId: 's1', warmup: false })).toEqual(['b'])
    expect(await ids({ warmup: true })).toEqual(['a'])
    expect(await ids({ since: 200 })).toEqual(['b', 'c'])
    expect(await ids({ until: 200 })).toEqual(['a', 'b'])
    expect(await ids({ until: 199 })).toEqual(['a'])
    expect(await ids({ gameProfileId: 'cs2', since: 150 })).toEqual(['b'])
    expect(await ids({ gameProfileId: 'fortnite' })).toEqual([])
  })
})

describe('Reset Finder markers', () => {
  it('start empty, are kept per Game Profile, and never move back', async () => {
    const store = createMemoryStore()
    expect(await store.finderResets()).toEqual({})
    await store.resetFinder('valorant', 500)
    await store.resetFinder('cs2', 700)
    await store.resetFinder('valorant', 400) // an older marker (an import from a machine that reset earlier) cannot undo a later one
    expect(await store.finderResets()).toEqual({ valorant: 500, cs2: 700 })
    await store.resetFinder('valorant', 900)
    expect((await store.finderResets()).valorant).toBe(900)
  })

  it('do not touch the Runs', async () => {
    const store = createMemoryStore()
    const record = testRecord({}, { id: 'a', startedAt: 100 })
    await store.save([record])
    await store.resetFinder('valorant', 1_000)
    expect(await store.list()).toHaveLength(1)
    expect(await store.get('a')).toEqual(record)
  })

  it('are for a Game Profile, which the type says: an unknown id does not compile', async () => {
    const store = createMemoryStore()
    // @ts-expect-error 'quake' is not a GameProfileId; `pnpm typecheck` fails if this stops being an error
    await store.resetFinder('quake', 1_000)
  })
})
