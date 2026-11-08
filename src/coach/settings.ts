import { createAnthropicProvider } from './anthropic'
import { isLocalUrl } from './errors'
import { createOpenAiProvider } from './openai'
import type { CoachProvider } from '../core'

export type CoachProviderId = 'anthropic' | 'openai'

/**
 * How the player connected the AI Coach. It holds API keys, so it lives under its own localStorage key and is never part of
 * the Run export file (which only reads the RunStore), of `Preferences`, or of anything logged. A key is sent to the
 * provider the player chose and nowhere else. Both providers keep their own fields so switching does not lose a key.
 */
export interface CoachSettings {
  provider: CoachProviderId
  anthropic: { apiKey: string; model: string }
  openai: { baseUrl: string; model: string; apiKey: string }
  /** The language the AI Coach replies in, as the model should read it: "English", "Vietnamese", or whatever the player typed. */
  language: string
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

export const defaultCoachSettings: CoachSettings = {
  provider: 'anthropic',
  anthropic: { apiKey: '', model: DEFAULT_ANTHROPIC_MODEL },
  openai: { baseUrl: 'http://localhost:11434/v1', model: '', apiKey: '' },
  language: 'English',
}

const KEY = 'betteraim.coach'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v.trim() : fallback)

/** Reads a saved value field by field; whatever is missing or not text gets its default. Never throws. */
export function parseCoachSettings(raw: unknown): CoachSettings {
  const d = defaultCoachSettings
  const { provider, anthropic, openai, language } = obj(raw)
  const a = obj(anthropic)
  const o = obj(openai)
  return {
    provider: provider === 'openai' ? 'openai' : 'anthropic',
    anthropic: { apiKey: text(a.apiKey, ''), model: text(a.model, d.anthropic.model) || d.anthropic.model },
    openai: { baseUrl: text(o.baseUrl, d.openai.baseUrl), model: text(o.model, ''), apiKey: text(o.apiKey, '') },
    language: text(language, d.language) || d.language,
  }
}

// Used when storage is blocked (private window, quota), so the connection still holds until the tab closes.
let session: CoachSettings | null = null

export const loadCoachSettings = (): CoachSettings => {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return parseCoachSettings(JSON.parse(stored))
  } catch {
    // unreadable storage or corrupt JSON: fall through
  }
  return session ?? defaultCoachSettings
}

export const saveCoachSettings = (settings: CoachSettings): void => {
  session = settings
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // kept in `session` only
  }
}

/** A pasted `/chat/completions` and trailing slashes are not part of the base URL. */
export const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')

/**
 * What is wrong with a base URL, or null. The Content Security Policy only lets `https:` through, plus `http:` to localhost and
 * 127.0.0.1 (browsers also refuse plain http to other hosts from an https page), so anything else could never connect.
 */
export function baseUrlProblem(url: string): string | null {
  if (!URL.canParse(url)) return 'Enter a full address such as http://localhost:11434/v1.'
  const { protocol, hostname } = new URL(url)
  if (protocol === 'https:') return null
  if (hostname === '[::1]') return 'Use localhost or 127.0.0.1: the browser cannot be allowed to reach [::1].'
  if (protocol === 'http:' && isLocalUrl(url)) return null
  return 'Use https://, or http:// with localhost or 127.0.0.1. A plain http address on your network (such as 192.168.x.x) is blocked.'
}

/** What the player still has to fill in before the AI Coach can be asked, or null when it is ready. */
export function missingSetup(s: CoachSettings): string | null {
  if (s.provider === 'anthropic') return s.anthropic.apiKey ? null : 'Add your Anthropic API key'
  if (baseUrlProblem(normalizeBaseUrl(s.openai.baseUrl))) return 'Enter a valid base URL'
  return s.openai.model ? null : 'Enter the model name'
}

/** The provider the settings describe, or null while they are incomplete. */
export function createCoachProvider(s: CoachSettings): CoachProvider | null {
  if (missingSetup(s)) return null
  return s.provider === 'anthropic'
    ? createAnthropicProvider(s.anthropic)
    : createOpenAiProvider({ baseUrl: normalizeBaseUrl(s.openai.baseUrl), model: s.openai.model, apiKey: s.openai.apiKey || undefined })
}
