import { useState } from 'react'
import { baseUrlProblem, coachFailureMessage, createCoachProvider, DEFAULT_ANTHROPIC_MODEL, loadCoachSettings, missingSetup, normalizeBaseUrl, saveCoachSettings } from '../coach/settings'
import type { CoachProviderId, CoachSettings } from '../coach/settings'
import { Select } from './fields'
import './coach.css'

const PROVIDERS = [
  ['anthropic', 'Anthropic (Claude)'],
  ['openai', 'OpenAI-compatible endpoint'],
] as const satisfies readonly (readonly [CoachProviderId, string])[]

/** Presets only fill in the address (and a model where one is well known); the model name is the player's to type. */
const PRESETS = [
  { id: 'ollama', name: 'Ollama (on this computer)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', hint: 'Pull a model first, for example "ollama pull llama3.2", and use its name here.' },
  { id: 'lmstudio', name: 'LM Studio (on this computer)', baseUrl: 'http://localhost:1234/v1', model: '', hint: 'Use the model name LM Studio shows for the model you loaded.' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '', hint: 'Needs a key. Model names look like "provider/model-name".' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '', hint: 'Needs a key. Use the name of a chat model your account can use.' },
] as const

const LANGUAGES = ['English', 'Vietnamese', 'Spanish', 'Portuguese', 'French', 'German', 'Italian', 'Polish', 'Russian', 'Turkish', 'Indonesian', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Arabic']
const OTHER = '__other__'

function TextField({ label, value, onChange, placeholder, secret, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean; hint?: string }) {
  return (
    <label>
      <span>{label}</span>
      <span className="field">
        {/* autoComplete off: a password manager should not file an API key under this site. */}
        <input type={secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

type Test = { state: 'idle' } | { state: 'testing' } | { state: 'ok' } | { state: 'failed'; message: string }

/**
 * The AI Coach connection: provider, keys, model, reply language, a Test connection that makes one tiny request, and the
 * explanations the player needs to get a local model working. It keeps its own store (src/coach/settings.ts) because it holds keys.
 */
export function CoachSection() {
  const [settings, setSettings] = useState(loadCoachSettings)
  const [other, setOther] = useState(() => !LANGUAGES.includes(settings.language))
  const [test, setTest] = useState<Test>({ state: 'idle' })
  const update = (patch: Partial<CoachSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveCoachSettings(next)
    setTest({ state: 'idle' })
  }
  const { anthropic, openai } = settings
  const preset = PRESETS.find((p) => p.baseUrl === normalizeBaseUrl(openai.baseUrl))
  const urlProblem = baseUrlProblem(normalizeBaseUrl(openai.baseUrl))
  const missing = missingSetup(settings)
  const origin = globalThis.location?.origin ?? 'this site'

  const runTest = async () => {
    const provider = createCoachProvider(settings)
    if (!provider) return
    setTest({ state: 'testing' })
    try {
      await provider.complete({ system: 'This is a connection test. Answer in as few words as possible.', prompt: 'Reply with the word OK.' })
      setTest({ state: 'ok' })
    } catch (error) {
      setTest({ state: 'failed', message: await coachFailureMessage(error, settings) })
    }
  }

  return (
    <section>
      <h2>AI Coach</h2>
      <p className="hint">
        Optional. Connect your own Anthropic key or any OpenAI-compatible endpoint, including a model running on your computer. The AI Coach
        is asked only when you press a button, and it is sent aggregate figures from your Analysis, never your raw mouse data.
      </p>
      {/* A form so the key fields are not loose passwords; there is nothing to submit. */}
      <form className="setup" onSubmit={(e) => e.preventDefault()}>
        <Select label="Provider" value={settings.provider} choices={PROVIDERS} onChange={(provider) => update({ provider })} />

        {settings.provider === 'anthropic' ? (
          <>
            <TextField label="Anthropic API key" secret value={anthropic.apiKey} placeholder="sk-ant-..." onChange={(apiKey) => update({ anthropic: { ...anthropic, apiKey: apiKey.trim() } })} />
            <TextField
              label="Model"
              value={anthropic.model}
              placeholder={DEFAULT_ANTHROPIC_MODEL}
              hint={`Default ${DEFAULT_ANTHROPIC_MODEL}. Another model name works if your key can use it and it takes an effort setting.`}
              onChange={(model) => update({ anthropic: { ...anthropic, model: model.trim() } })}
            />
          </>
        ) : (
          <>
            <Select
              label="Preset"
              value={preset?.id ?? 'custom'}
              choices={[...PRESETS.map((p) => [p.id, p.name] as const), ['custom', 'Other address']]}
              onChange={(id) => {
                const chosen = PRESETS.find((p) => p.id === id)
                if (chosen) update({ openai: { ...openai, baseUrl: chosen.baseUrl, model: chosen.model || openai.model } })
              }}
            />
            <TextField label="Base URL" value={openai.baseUrl} placeholder="http://localhost:11434/v1" onChange={(baseUrl) => update({ openai: { ...openai, baseUrl } })} />
            {urlProblem && <p className="hint" role="alert">{urlProblem}</p>}
            <TextField label="Model" value={openai.model} hint={preset?.hint ?? 'The model name the endpoint expects.'} onChange={(model) => update({ openai: { ...openai, model: model.trim() } })} />
            <TextField label="API key (optional)" secret value={openai.apiKey} hint="Local servers need none." onChange={(apiKey) => update({ openai: { ...openai, apiKey: apiKey.trim() } })} />
          </>
        )}

        <Select
          label="Reply language"
          value={other ? OTHER : settings.language}
          choices={[...LANGUAGES.map((l) => [l, l] as const), [OTHER, 'Another language...'] as const]}
          onChange={(choice) => {
            setOther(choice === OTHER)
            if (choice !== OTHER) update({ language: choice })
          }}
        />
        {other && <TextField label="Language" value={settings.language} placeholder="For example Swedish" onChange={(language) => update({ language })} />}

        <div className="coach-test">
          <button type="button" disabled={missing !== null || test.state === 'testing'} onClick={() => void runTest()}>
            {test.state === 'testing' ? 'Testing...' : 'Test connection'}
          </button>
          <span role="status" className={test.state === 'ok' ? 'ok' : 'hint'}>
            {test.state === 'ok' ? 'Connected. The AI Coach answered.' : missing !== null ? `${missing} first.` : test.state === 'idle' ? 'Sends one tiny request to your provider.' : ''}
          </span>
        </div>
        {test.state === 'failed' && <p className="warning" role="alert">{test.message}</p>}
      </form>

      <div className="coach-help">
        <h3>Your key and your data</h3>
        <p>
          The key is kept only in this browser's local storage, in its own entry, and never in the file you export. It is sent only to the provider you chose here. BetterAim loads no
          third-party scripts, and a Content Security Policy blocks any script that is not part of the app.
        </p>
        <p>
          A static policy cannot promise more than that: the AI Coach may call any https address, so a compromised library inside the app could still send your key out, and other
          pages on the same web address can read local storage. Use a key with a spending limit.
        </p>

        <h3>Using a local model (Ollama, LM Studio)</h3>
        <ol>
          <li>
            Start the server. Ollama listens on <code>http://localhost:11434/v1</code>. In LM Studio, open the Developer tab and start the server (<code>http://localhost:1234/v1</code>).
          </li>
          <li>
            Allow this website, <code>{origin}</code>. Ollama: set the environment variable <code>OLLAMA_ORIGINS</code> to <code>{origin}</code> and restart Ollama. On macOS run{' '}
            <code>launchctl setenv OLLAMA_ORIGINS "{origin}"</code> and reopen the app. On Linux add <code>Environment="OLLAMA_ORIGINS={origin}"</code> under [Service] with{' '}
            <code>systemctl edit ollama.service</code>, then run <code>systemctl daemon-reload &amp;&amp; systemctl restart ollama</code>. On Windows quit Ollama from the tray, add a user
            environment variable <code>OLLAMA_ORIGINS</code>, and start it again. LM Studio: switch on <strong>Enable CORS</strong> in the server settings (it lets any website use your
            server while it runs).
          </li>
          <li>Use Chrome, Edge or Firefox. Safari does not let a web page call <code>http://localhost</code>.</li>
          <li>
            Press <strong>Test connection</strong>. Chrome asks whether this site may reach other apps and services on this device (Chrome 142 to 144 word it as a local network
            permission): choose <strong>Allow</strong>. If you blocked it before: lock icon, Site settings, set <strong>Loopback network</strong> to Allow, then reload. Some
            versions label that setting "Apps on device" (Chrome 142 to 144: "Local network access"); the wording varies by version.
          </li>
          <li>Use <code>localhost</code> or <code>127.0.0.1</code>, not an address on your network and not <code>[::1]</code>.</li>
        </ol>
        <p>If it still fails, check in this order: the server is running, the model name is right, this website is allowed (step 2), the browser permission (step 4).</p>
        <p>
          Checked on 2026-11-08, with a test in Chrome 156 and Chrome's{' '}
          <a href="https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access" target="_blank" rel="noreferrer noopener">Local Network Access guide</a>. Since Chrome 142 a
          public web page needs your permission to call <code>localhost</code>. Calling plain http on localhost from an https page is not blocked as mixed content, and the server needs
          normal CORS only. Browsers change this; if Chrome behaves differently, its guide is the reference.
        </p>
      </div>
    </section>
  )
}
