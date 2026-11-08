import { describe, expect, it } from 'vitest'
import { coarseLevels } from '../core'
import type { RunSummary } from '../core'
import { analysedSynthetic } from '../core/testing/analysis'
import { syntheticPlayer, syntheticRuns } from '../core/testing/synthetic'
import { historyRuns, sensitivityText } from './runs-view'

const finderRuns = syntheticRuns(syntheticPlayer(), [{ levels: coarseLevels(40) }], 1)
const practice = (over: Partial<RunSummary> = {}): RunSummary => ({ ...finderRuns[3]!, id: `p-${over.gameProfileId ?? 'valorant'}`, mode: 'practice', sensitivity: 31.7, ...over })

describe('blinding between Sessions in the Run lists', () => {
  it("hides a Finder Run's Sensitivity, Warm-up Runs included, and says why", () => {
    expect(finderRuns.some((r) => r.warmup)).toBe(true)
    for (const run of finderRuns) {
      const text = sensitivityText(run)
      expect(text).toBe('hidden (Finder)')
      expect(text).not.toContain(String(run.sensitivity))
    }
  })

  it('shows what a Practice Run was played at', () => {
    expect(sensitivityText(practice())).toBe('31.7 cm/360')
  })
})

describe('History', () => {
  const items = analysedSynthetic([...finderRuns, practice(), practice({ gameProfileId: 'cs2' })])

  it('keeps Practice and Finder Runs apart, so Finder Runs at varied hidden Sensitivities do not pollute Practice trends', () => {
    expect(historyRuns(items, 'practice', undefined).map((i) => i.run.mode)).toEqual(['practice', 'practice'])
    expect(historyRuns(items, 'finder', undefined)).toHaveLength(finderRuns.length)
    expect(historyRuns(items, 'finder', undefined).every((i) => i.run.mode === 'finder')).toBe(true)
  })

  it('shows the active Game Profile only', () => {
    expect(historyRuns(items, 'practice', 'cs2').map((i) => i.run.gameProfileId)).toEqual(['cs2'])
    expect(historyRuns(items, 'practice', 'valorant').map((i) => i.run.gameProfileId)).toEqual(['valorant'])
    expect(historyRuns(items, 'finder', 'cs2')).toEqual([])
    expect(historyRuns(items, 'finder', 'valorant')).toHaveLength(finderRuns.length)
  })
})
