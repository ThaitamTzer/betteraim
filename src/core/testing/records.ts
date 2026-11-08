import type { RunMeta, RunParams, RunRecord } from '../types'
import { aimBot, runBot } from './bots'
import type { Bot } from './bots'
import { testMeta, testParams } from './params'

/** A real, fully played Run record (a perfect bot unless one is given) at the given params, for storage, export and aggregation tests. */
export const testRecord = (params: Partial<RunParams> = {}, meta: Partial<RunMeta> = {}, bot: Bot = aimBot()): RunRecord => {
  const p = testParams(params)
  return { ...p, ...testMeta(meta), ...runBot(p, bot) }
}
