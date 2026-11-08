import { CoachError } from '../core'

/** localhost and 127.0.0.1 only: they are the http hosts the Content Security Policy lets through (see vite.config.ts). */
export const isLocalUrl = (url: string): boolean => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)

/** What the player can do when a request got no answer at all. A browser cannot tell these causes apart, so they are all listed. */
export function networkError(target: string, url?: string): CoachError {
  const origin = globalThis.location?.origin ?? 'this site'
  const causes =
    url !== undefined && isLocalUrl(url)
      ? ` Check, in this order: the model server is running; the model name is right; the server allows ${origin} (Ollama: set OLLAMA_ORIGINS to ${origin} and restart it; LM Studio: switch on Enable CORS); your browser allowed this site to reach apps on your device (Chrome: lock icon, Site settings, Apps on device). Options explains each step.`
      : ` Check your internet connection and the address. The provider may also refuse requests that come from a web page (CORS), or an extension or firewall may block them.${
          // Tested: api.openai.com answers a wrong key (401) without CORS headers, which the browser reports as a network failure.
          url?.startsWith('https://api.openai.com/') ? ' OpenAI also answers a wrong API key without the headers a web page needs, so a wrong key looks like this: check the key first.' : ''
        }`
  return new CoachError('network', `Could not reach ${target}.${causes}`)
}

/** True when Chrome says this site is blocked from reaching apps on the device. Never asks for `local-network-access`: older Chrome crashes the page on it. */
async function loopbackBlocked(): Promise<boolean> {
  try {
    return (await navigator.permissions.query({ name: 'loopback-network' as PermissionName })).state === 'denied'
  } catch {
    return false // the browser does not know this permission
  }
}

/** The text to show for whatever a request threw, with the one extra hint only the browser can tell: a blocked permission. */
export async function failureMessage(error: unknown, localServer: boolean): Promise<string> {
  if (!(error instanceof CoachError)) return `Something unexpected went wrong: ${error instanceof Error ? error.message : String(error)}`
  if (error.kind === 'network' && localServer && (await loopbackBlocked())) {
    return `${error.message} Chrome shows this site is blocked from reaching apps on your device: click the lock icon in the address bar, open Site settings, set Apps on device to Allow, then reload.`
  }
  return error.message
}

/** An HTTP error answer, as a player-facing `CoachError`. `serverMessage` is what the provider said, when it said anything. */
export function httpError(who: string, status: number, serverMessage: string): CoachError {
  const said = serverMessage ? ` It said: ${serverMessage}` : ''
  if (status === 401 || status === 403) return new CoachError('auth', `${who} did not accept the API key (HTTP ${status}). Check the key in Options.${said}`)
  if (status === 429) return new CoachError('rate-limit', `${who} says you sent too many requests or have no credit left (HTTP 429). Wait a little, then check your plan and balance.${said}`)
  const hint = status === 404 || status === 400 ? ' Check the model name and the address in Options.' : ''
  return new CoachError('provider', `${who} returned an error (HTTP ${status}).${hint}${said}`)
}
