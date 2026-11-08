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
    expect(await ids({ gameProfileId: 'none' })).toEqual([])
  })
})
