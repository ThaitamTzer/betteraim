import type { RunMeta, RunParams, RunRecord } from '../types'
import { aimBot, runBot } from './bots'
import { testMeta, testParams } from './params'

/** A real, fully played Run record (a perfect bot at the given seed), for storage and export tests. */
export const testRecord = (params: Partial<RunParams> = {}, meta: Partial<RunMeta> = {}): RunRecord => {
  const p = testParams(params)
  return { ...p, ...testMeta(meta), ...runBot(p, aimBot()) }
}
