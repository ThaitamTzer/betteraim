/** A JSON Schema, in the subset `askJson` checks (see json.ts) and that structured-output endpoints accept. */
export type JsonSchema = { [key: string]: unknown }

/**
 * One question to the AI Coach. `json` asks for a reply that is a JSON document of that schema: the adapter uses the
 * provider's native constraint where it has one, and `askJson` checks the result either way, so an endpoint that ignores
 * the constraint is still caught.
 */
export interface CoachRequest {
  system: string
  prompt: string
  json?: { name: string; schema: JsonSchema }
}

/**
 * The AI Coach port: a language model behind one call that returns its text. Adapters (src/coach/) shape the request for
 * their API and turn every failure into a `CoachError`; everything else (prompts, payloads, validation) is core.
 */
export interface CoachProvider {
  complete(request: CoachRequest): Promise<string>
}

/**
 * - `refusal`: the model declined (a safety classifier or the endpoint's content filter).
 * - `network`: the request never got an answer: server down, wrong address, CORS or a browser permission.
 * - `auth`: the provider did not accept the key.
 * - `rate-limit`: too many requests or no credit left.
 * - `malformed`: an answer came, but it is empty, cut off or not what was asked for.
 * - `provider`: any other error the provider reported, such as an unknown model name.
 */
export type CoachErrorKind = 'refusal' | 'network' | 'auth' | 'rate-limit' | 'malformed' | 'provider'

/** `message` is written for the player and is shown as it is. */
export class CoachError extends Error {
  constructor(
    readonly kind: CoachErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'CoachError'
  }
}
