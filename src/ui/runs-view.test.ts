import { describe, expect, it } from 'vitest'
import { coarseLevels } from '../core'
import type { RunSummary } from '../core'
import { syntheticPlayer, syntheticRuns } from '../core/testing/synthetic'
import { sensitivityText } from './runs-view'

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
