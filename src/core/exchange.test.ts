import { describe, expect, it } from 'vitest'
import { createMemoryStore, exportData, ImportError, importData } from './index'
import type { RunStore } from './index'
import { testRecord } from './testing/records'
import type { RunRecord } from './types'

const records = (): RunRecord[] => [
  testRecord({ seed: 1 }, { id: 'a', startedAt: 1_000, sessionId: 's1', warmup: true }),
  testRecord({ seed: 2, sensitivity: 31.7, dpi: 1600 }, { id: 'b', startedAt: 2_000, sessionId: 's1', levels: 7 }),
  testRecord(
    { seed: 3, fov: { degrees: 90, axis: 'vertical' } },
    { id: 'c', startedAt: 3_000, mode: 'finder', env: { devicePixelRatio: 1.25, userAgent: 'Firefox/152', rawInput: false } },
  ),
  testRecord({ seed: 4 }, { id: 'd', startedAt: 4_000, sessionId: undefined, env: undefined }), // Practice, from before env was captured
]

const everything = async (store: RunStore) =>
  Promise.all((await store.list()).map((s) => store.get(s.id)))

const storeWith = async (runs: RunRecord[]) => {
  const store = createMemoryStore()
  await store.save(runs)
  return store
}

describe('exporting and importing', () => {
  it('a round trip into an empty store yields identical data', async () => {
    const original = records()
    const file = await exportData(await storeWith(original))

    const copy = createMemoryStore()
    expect(await importData(copy, file)).toBe(4)

    expect(await everything(copy)).toEqual(original)
    expect(await copy.list()).toEqual(await (await storeWith(original)).list())
    expect(await exportData(copy)).toBe(file) // and the file itself is stable
  })

  it('writes one JSON file that names its format and version', async () => {
    const file = JSON.parse(await exportData(await storeWith(records())))
    expect(file).toMatchObject({ format: 'betteraim-export', version: 1 })
    expect(file.runs).toHaveLength(4)
    expect(file.runs[3]).not.toHaveProperty('sessionId')
    expect(file.runs[3]).not.toHaveProperty('env')
  })

  it('merges into existing Runs: others are kept, the same id is replaced, importing twice changes nothing', async () => {
    const file = await exportData(await storeWith(records()))
    const target = await storeWith([
      testRecord({ seed: 9 }, { id: 'other', startedAt: 500 }),
      testRecord({ seed: 99 }, { id: 'a', startedAt: 1_000 }),
    ])
    await importData(target, file)
    await importData(target, file)
    expect((await target.list()).map((r) => r.id)).toEqual(['other', 'a', 'b', 'c', 'd'])
    expect(await target.get('a')).toEqual(records()[0])
  })

  describe('rejects a bad file and leaves existing data untouched', () => {
    const good = async () => JSON.parse(await exportData(await storeWith(records())))
    const stringify = (file: unknown) => JSON.stringify(file)
    const cases: Record<string, (file: any) => string> = {
      'not JSON': () => '{"format": "betteraim-ex',
      'not an object': () => '[]',
      'another kind of file': (f) => stringify({ ...f, format: 'something-else' }),
      'a newer format version': (f) => stringify({ ...f, version: 2 }),
      'an older format version': (f) => stringify({ ...f, version: 0 }),
      'a missing version': ({ version, ...f }) => (void version, stringify(f)),
      'runs that is not a list': (f) => stringify({ ...f, runs: {} }),
      'an unknown Scenario': (f) => stringify({ ...f, runs: [{ ...f.runs[0], scenario: 'nope' }, ...f.runs.slice(1)] }),
      'an unknown mode': (f) => stringify({ ...f, runs: [{ ...f.runs[0], mode: 'ranked' }, ...f.runs.slice(1)] }),
      'a non-numeric Score': (f) => stringify({ ...f, runs: [{ ...f.runs[0], score: '9' }, ...f.runs.slice(1)] }),
      'a capture environment that is not an object': (f) => stringify({ ...f, runs: [{ ...f.runs[0], env: 'Chrome' }, ...f.runs.slice(1)] }),
      'a malformed capture environment': (f) =>
        stringify({ ...f, runs: [{ ...f.runs[0], env: { ...f.runs[0].env, devicePixelRatio: 'wide' } }, ...f.runs.slice(1)] }),
      'a level count that is not a whole number': (f) => stringify({ ...f, runs: [{ ...f.runs[0], levels: 7.5 }, ...f.runs.slice(1)] }),
      'a missing id': (f) => stringify({ ...f, runs: [{ ...f.runs[0], id: '' }, ...f.runs.slice(1)] }),
      'input that is not base64': (f) => stringify({ ...f, runs: [{ ...f.runs[0], input: '***' }, ...f.runs.slice(1)] }),
      'truncated input': (f) => stringify({ ...f, runs: [{ ...f.runs[0], input: f.runs[0].input.slice(0, 36) }, ...f.runs.slice(1)] }),
      'a bad Run after good ones': (f) => stringify({ ...f, runs: [...f.runs.slice(0, 2), { ...f.runs[2], targetEvents: 'AAAA' }] }),
    }

    for (const [name, corrupt] of Object.entries(cases)) {
      it(name, async () => {
        const existing = [testRecord({ seed: 5 }, { id: 'keep', startedAt: 10 }), testRecord({ seed: 6 }, { id: 'a', startedAt: 20 })]
        const target = await storeWith(existing)
        const before = await everything(target)

        await expect(importData(target, corrupt(await good()))).rejects.toThrow(ImportError)

        expect(await everything(target)).toEqual(before)
      })
    }

    it('says why a version is not supported', async () => {
      const file = { ...(await good()), version: 2 }
      await expect(importData(createMemoryStore(), JSON.stringify(file))).rejects.toThrow(/version 2/)
    })
  })
})
