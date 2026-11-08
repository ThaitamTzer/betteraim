import { CoachError } from '../core'
import type { CoachProvider } from '../core'
import { httpError, networkError } from './errors'

export interface AnthropicConfig {
  apiKey: string
  model: string
}

/** Opus 5.5 defaults to medium; set here so a later default change cannot change what a request costs. */
const EFFORT = 'medium'

/**
 * The Anthropic adapter. The SDK is imported when a request is made, so it stays out of the initial bundle. The request has
 * no sampling parameters (current Claude models reject `temperature`), asks the API to re-run a request that a safety
 * classifier declined on another model (`fallbacks`), and is not retried by the SDK: the player decides whether to ask again.
 * `fetchImpl` is for tests.
 */
export function createAnthropicProvider({ apiKey, model }: AnthropicConfig, fetchImpl?: typeof fetch): CoachProvider {
  return {
    async complete({ system, prompt, json }) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      // The key belongs to the player and stays on their device, which is the case dangerouslyAllowBrowser is for.
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, fetch: fetchImpl })
      let response
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 16_000,
          system,
          messages: [{ role: 'user', content: prompt }],
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: EFFORT, ...(json && { format: { type: 'json_schema' as const, schema: json.schema } }) },
        })
      } catch (error) {
        if (error instanceof Anthropic.APIConnectionError) throw networkError('api.anthropic.com')
        if (error instanceof Anthropic.APIError && error.status !== undefined) throw httpError('Anthropic', error.status, error.apiMessage ?? error.message)
        throw error
      }
      if (response.stop_reason === 'refusal') {
        const { category, explanation } = response.stop_details ?? {}
        throw new CoachError(
          'refusal',
          `The AI Coach declined this request${category ? ` (category: ${category})` : ''}, and no other model took it over. ${explanation ?? ''} Try again, or choose another model in Options.`.replace(/\s+/g, ' '),
        )
      }
      if (response.stop_reason === 'max_tokens') throw new CoachError('malformed', 'The answer was cut off because it hit the length limit. Try again.')
      // `content` can start with thinking or fallback blocks: take the text blocks only.
      return response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
    },
  }
}
