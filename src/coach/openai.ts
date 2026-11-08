import { CoachError } from '../core'
import type { CoachProvider } from '../core'
import { httpError, networkError } from './errors'

export interface OpenAiConfig {
  /** Up to and including `/v1`, for example `http://localhost:11434/v1`. */
  baseUrl: string
  model: string
  /** Optional: local servers need none. */
  apiKey?: string
}

/** Parameters an endpoint may refuse; when it says so, they are dropped and the request is sent again. */
const OPTIONAL = ['temperature', 'response_format'] as const

const serverMessage = (body: string): string => {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown }
    const found = typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? parsed.message)
    if (typeof found === 'string') return found
  } catch {
    // not JSON: use the text
  }
  return body.slice(0, 300)
}

interface Choice {
  finish_reason?: string | null
  message?: { content?: unknown; refusal?: unknown }
}

function readChoice(data: unknown): string {
  const choice = (data as { choices?: Choice[] } | null)?.choices?.[0]
  const refusal = choice?.message?.refusal
  if (typeof refusal === 'string' && refusal) throw new CoachError('refusal', `The AI Coach declined this request: ${refusal}`)
  if (choice?.finish_reason === 'content_filter') throw new CoachError('refusal', "The provider's content filter stopped this answer.")
  const content = choice?.message?.content
  if (typeof content !== 'string') throw new CoachError('malformed', 'The endpoint answered, but without any text. Check that the model name is a chat model.')
  if (choice?.finish_reason === 'length') throw new CoachError('malformed', 'The answer was cut off because it hit the length limit. Try again, or use a model with a longer context.')
  // Reasoning models (such as DeepSeek R1 on Ollama) put their thinking in the text.
  return content.replace(/<think>[\s\S]*?<\/think>/g, '')
}

/**
 * The OpenAI-compatible adapter (OpenAI, OpenRouter, Ollama, LM Studio): a POST to `<baseUrl>/chat/completions`.
 * `temperature` is 0 so the same prompt gets the same answer where the endpoint allows it; an endpoint that refuses a
 * parameter (some OpenAI models refuse `temperature`) gets the request again without it, once per parameter. No `max_tokens`:
 * models differ on its name. `fetchImpl` is for tests.
 */
export function createOpenAiProvider({ baseUrl, model, apiKey }: OpenAiConfig, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): CoachProvider {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const target = URL.canParse(url) ? new URL(url) : { origin: baseUrl, host: baseUrl }
  return {
    async complete({ system, prompt, json }) {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        ...(json && { response_format: { type: 'json_schema', json_schema: { name: json.name, schema: json.schema, strict: true } } }),
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(apiKey && { Authorization: `Bearer ${apiKey}` }) }
      for (;;) {
        let response: Response
        try {
          response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) })
        } catch {
          throw networkError(target.origin, url)
        }
        const text = await response.text()
        if (response.ok) {
          try {
            return readChoice(JSON.parse(text))
          } catch (error) {
            if (error instanceof CoachError) throw error
            throw new CoachError('malformed', 'The endpoint answered, but not in the OpenAI chat format. Check the base URL (it usually ends in /v1).')
          }
        }
        const refused = OPTIONAL.find((name) => name in body && (response.status === 400 || response.status === 422) && text.includes(name))
        if (!refused) throw httpError(target.host, response.status, serverMessage(text))
        delete body[refused]
      }
    },
  }
}
