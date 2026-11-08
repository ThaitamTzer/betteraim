import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, exportData } from '../core'
import { testRecord } from '../core/testing/records'
import { baseUrlProblem, createCoachProvider, defaultCoachSettings, loadCoachSettings, missingSetup, normalizeBaseUrl, parseCoachSettings, saveCoachSettings } from './settings'

describe('parseCoachSettings', () => {
  it('gives the defaults for a first visit or an unusable save', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) expect(parseCoachSettings(raw)).toEqual(defaultCoachSettings)
    expect(defaultCoachSettings.anthropic.model).toBe('claude-opus-5-5')
  })

  it('reads back what was saved, through JSON like localStorage does', () => {
    const saved = {
      provider: 'openai',
      anthropic: { apiKey: 'sk-ant-1', model: 'claude-sonnet-5-5' },
      openai: { baseUrl: 'https://openrouter.ai/api/v1', model: 'x/y', apiKey: 'sk-or-1' },
      language: 'Vietnamese',
    } as const
    expect(parseCoachSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  it('replaces only the fields that are bad', () => {
    const parsed = parseCoachSettings({ provider: 'gemini', anthropic: { apiKey: 5, model: '  ' }, openai: { baseUrl: ' https://a.b/v1 ', model: 'm' }, language: '' })
    expect(parsed).toEqual({ ...defaultCoachSettings, openai: { baseUrl: 'https://a.b/v1', model: 'm', apiKey: '' } })
  })
})

describe('the saved connection', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    })
  })
  afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'))

  it('keeps the key in its own localStorage entry and out of the Run export', async () => {
    const settings = { ...defaultCoachSettings, anthropic: { apiKey: 'sk-ant-SECRET', model: 'claude-opus-5-5' } }
    saveCoachSettings(settings)
    expect(loadCoachSettings()).toEqual(settings)
    expect([...store.keys()]).toEqual(['betteraim.coach'])

    const runs = createMemoryStore()
    await runs.save([testRecord()])
    expect(await exportData(runs)).not.toContain('SECRET')
  })

  it('still holds the connection for the tab when storage is blocked', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    const settings = { ...defaultCoachSettings, language: 'Polish' }
    saveCoachSettings(settings)
    expect(loadCoachSettings()).toEqual(settings)
  })
})

describe('the OpenAI-compatible base URL', () => {
  it('takes https anywhere and http only on localhost or 127.0.0.1', () => {
    for (const ok of ['https://api.openai.com/v1', 'https://openrouter.ai/api/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://localhost/v1']) {
      expect(baseUrlProblem(ok), ok).toBeNull()
    }
    for (const bad of ['', 'localhost:11434/v1', 'http://192.168.1.5:1234/v1', 'http://[::1]:11434/v1', 'http://localhost.evil.example/v1', 'http://api.openai.com/v1', 'ftp://localhost/v1']) {
      expect(baseUrlProblem(bad), bad).toEqual(expect.any(String))
    }
  })

  it('drops trailing slashes and a pasted /chat/completions', () => {
    expect(normalizeBaseUrl(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1')
    expect(normalizeBaseUrl('https://api.openai.com/v1/chat/completions')).toBe('https://api.openai.com/v1')
  })
})

describe('being ready', () => {
  it('needs a key for Anthropic, and a valid address and a model for the other provider (the key is optional)', () => {
    expect(missingSetup(defaultCoachSettings)).toMatch(/key/)
    expect(createCoachProvider(defaultCoachSettings)).toBeNull()
    const local = { ...defaultCoachSettings, provider: 'openai' as const }
    expect(missingSetup(local)).toMatch(/model/)
    const ready = { ...local, openai: { ...local.openai, model: 'llama3.2' } }
    expect(missingSetup(ready)).toBeNull()
    expect(createCoachProvider(ready)).not.toBeNull()
    expect(missingSetup({ ...ready, openai: { ...ready.openai, baseUrl: 'http://192.168.0.2/v1' } })).toMatch(/URL/)
    expect(createCoachProvider({ ...defaultCoachSettings, anthropic: { apiKey: 'k', model: 'claude-opus-5-5' } })).not.toBeNull()
  })
})
