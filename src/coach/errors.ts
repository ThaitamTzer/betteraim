import { CoachError } from '../core'

/** localhost and 127.0.0.1 only: they are the http hosts the Content Security Policy lets through (see vite.config.ts). */
export const isLocalUrl = (url: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)

/** What the player can do when a request got no answer at all. A browser cannot tell these causes apart, so they are all listed. */
export function networkError(target: string, url?: string): CoachError {
  const origin = globalThis.location?.origin ?? 'this site'
  const causes =
    url !== undefined && isLocalUrl(url)
      ? ` Check, in this order: the model server is running; the model name is right; the server allows ${origin} (Ollama: set OLLAMA_ORIGINS to ${origin} and restart it; LM Studio: switch on Enable CORS); your browser allowed this site to reach apps on your device (Chrome: lock icon, Site settings, Apps on device). Options explains each step.`
      : ' Check your internet connection and the address. The provider may also refuse requests that come from a web page (CORS), or an extension or firewall may block them.'
  return new CoachError('network', `Could not reach ${target}.${causes}`)
}

/** An HTTP error answer, as a player-facing `CoachError`. `serverMessage` is what the provider said, when it said anything. */
export function httpError(who: string, status: number, serverMessage: string): CoachError {
  const said = serverMessage ? ` It said: ${serverMessage}` : ''
  if (status === 401 || status === 403) return new CoachError('auth', `${who} did not accept the API key (HTTP ${status}). Check the key in Options.${said}`)
  if (status === 429) return new CoachError('rate-limit', `${who} says you sent too many requests or have no credit left (HTTP 429). Wait a little, then check your plan and balance.${said}`)
  const hint = status === 404 || status === 400 ? ' Check the model name and the address in Options.' : ''
  return new CoachError('provider', `${who} returned an error (HTTP ${status}).${hint}${said}`)
}
