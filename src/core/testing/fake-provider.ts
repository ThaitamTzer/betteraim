import { CoachError } from '../coach/provider'
import type { CoachProvider, CoachRequest } from '../coach/provider'

/** What a fake AI Coach does on one call: answer with this text, throw this, or work the answer out from the request. */
export type FakeReply = string | Error | ((request: CoachRequest) => string)

/**
 * A fake AI Coach (tests only, a real model is never called): answers `replies` in order and repeats the last one, and records
 * every request, so a test can assert on how often it was asked and on what.
 */
export function fakeProvider(...replies: FakeReply[]): { provider: CoachProvider; requests: CoachRequest[] } {
  const requests: CoachRequest[] = []
  const provider: CoachProvider = {
    complete: async (request) => {
      requests.push(request)
      const reply = replies[Math.min(requests.length, replies.length) - 1]
      if (reply instanceof Error) throw reply
      return typeof reply === 'function' ? reply(request) : (reply ?? '')
    },
  }
  return { provider, requests }
}

/** A well-formed structured answer of the Recommended Sensitivity operation. */
export const coachAnswer = (recommendedCm360: number, reasons: string[] = ['It balances the overshoots and undershoots.']): string => JSON.stringify({ recommendedCm360, reasons })

export const refusal = (): CoachError => new CoachError('refusal', 'The AI Coach declined to answer this request.')
