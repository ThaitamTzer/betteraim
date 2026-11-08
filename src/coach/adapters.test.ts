import { describe, expect, it } from 'vitest'
import { createAnthropicProvider } from './anthropic'
import { createOpenAiProvider } from './openai'

/** A fetch that answers from a script and records every request it was sent. */
function fakeFetch(...answers: (Response | Error)[]) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })
    const answer = answers[Math.min(calls.length, answers.length) - 1]!
    if (answer instanceof Error) throw answer
    return answer.clone()
  }
  return { fetchImpl, calls }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ask = { system: 'be brief', prompt: 'hello' }
const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }

describe('Anthropic adapter', () => {
  const message = (content: unknown[], stop_reason = 'end_turn', extra: object = {}) =>
    json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_details: null, usage: { input_tokens: 1, output_tokens: 1 }, ...extra })
  const provider = (f: ReturnType<typeof fakeFetch>, model = 'claude-opus-5-5') => createAnthropicProvider({ apiKey: 'sk-ant-test', model }, f.fetchImpl)

  it('shapes the request: no sampling parameters, explicit effort, refusal fallback, the key only as a header', async () => {
    const f = fakeFetch(message([{ type: 'text', text: 'hi' }]))
    await provider(f).complete(ask)
    const { url, headers, body } = f.calls[0]!
    expect(new URL(url).origin).toBe('https://api.anthropic.com')
    expect(headers.get('authorization')).toBe('Bearer sk-ant-test') // how SDK 1.x sends `apiKey`
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(body).toMatchObject({ model: 'claude-opus-5-5', system: 'be brief', fallbacks: 'default', output_config: { effort: 'medium' } })
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    for (const sampling of ['temperature', 'top_p', 'top_k']) expect(body, sampling).not.toHaveProperty(sampling)
    expect(JSON.stringify(body)).not.toContain('sk-ant-test')
  })

  it('uses the model the player chose', async () => {
    const f = fakeFetch(message([{ type: 'text', text: 'hi' }]))
    await provider(f, 'claude-sonnet-5-5').complete(ask)
    expect(f.calls[0]!.body.model).toBe('claude-sonnet-5-5')
  })

  it('asks for the JSON schema through the output format', async () => {
    const f = fakeFetch(message([{ type: 'text', text: '{"a":1}' }]))
    await expect(provider(f).complete({ ...ask, json: { name: 'pick', schema } })).resolves.toBe('{"a":1}')
    expect(f.calls[0]!.body.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema } })
  })

  it('returns the text blocks only, whatever comes before them', async () => {
    const f = fakeFetch(message([{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'there' }]))
    await expect(provider(f).complete(ask)).resolves.toBe('Hello there')
  })

  it('surfaces a refusal with its category', async () => {
    const f = fakeFetch(message([], 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } }))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind: 'refusal', message: expect.stringContaining('cyber') })
  })

  it('surfaces a cut-off answer as malformed output', async () => {
    const f = fakeFetch(message([{ type: 'text', text: 'Half an ans' }], 'max_tokens'))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind: 'malformed' })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [404, 'provider'],
    [500, 'provider'],
  ])('maps HTTP %i to %s and asks only once (no automatic retry)', async (status, kind) => {
    const f = fakeFetch(json({ type: 'error', error: { type: 'x', message: 'the server says no' } }, status))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind, message: expect.stringContaining('the server says no') })
    expect(f.calls).toHaveLength(1)
  })

  it('maps a request that never got an answer to a network error', async () => {
    const f = fakeFetch(new TypeError('Failed to fetch'))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('api.anthropic.com') })
    expect(f.calls).toHaveLength(1)
  })
})

describe('OpenAI-compatible adapter', () => {
  const reply = (content: unknown, finish_reason = 'stop', message: object = {}) => json({ choices: [{ finish_reason, message: { role: 'assistant', content, ...message } }] })
  const config = { baseUrl: 'http://localhost:11434/v1/', model: 'llama3.2' }
  const provider = (f: ReturnType<typeof fakeFetch>, c: { baseUrl: string; model: string; apiKey?: string } = config) => createOpenAiProvider(c, f.fetchImpl)

  it('posts to <baseUrl>/chat/completions with temperature 0, the model and both messages', async () => {
    const f = fakeFetch(reply('hi'))
    await expect(provider(f).complete(ask)).resolves.toBe('hi')
    const { url, headers, body } = f.calls[0]!
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(body).toMatchObject({ model: 'llama3.2', temperature: 0 })
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
    ])
    expect(body).not.toHaveProperty('max_tokens')
    expect(headers.has('authorization')).toBe(false)
  })

  it('sends the key as a bearer token when there is one', async () => {
    const f = fakeFetch(reply('hi'))
    await provider(f, { ...config, apiKey: 'sk-test' }).complete(ask)
    expect(f.calls[0]!.headers.get('authorization')).toBe('Bearer sk-test')
  })

  it('sends the request again, once, without temperature when the endpoint refuses it', async () => {
    const f = fakeFetch(json({ error: { message: "Unsupported value: 'temperature' does not support 0 with this model." } }, 400), reply('hi'))
    await expect(provider(f).complete(ask)).resolves.toBe('hi')
    expect(f.calls).toHaveLength(2)
    expect(f.calls[0]!.body.temperature).toBe(0)
    expect(f.calls[1]!.body).not.toHaveProperty('temperature')
  })

  it('does not drop temperature for an error that is about something else', async () => {
    const f = fakeFetch(json({ error: { message: 'model "llama9" not found' } }, 404))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind: 'provider', message: expect.stringContaining('model "llama9" not found') })
    expect(f.calls).toHaveLength(1)
  })

  it('asks for the JSON schema through response_format, and drops it where it is refused', async () => {
    const f = fakeFetch(json({ error: { message: 'response_format is not supported' } }, 400), reply('{"a":1}'))
    await expect(provider(f).complete({ ...ask, json: { name: 'pick', schema } })).resolves.toBe('{"a":1}')
    expect(f.calls[0]!.body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'pick', schema, strict: true } })
    expect(f.calls[1]!.body).not.toHaveProperty('response_format')
    expect(f.calls[1]!.body.temperature).toBe(0)
  })

  it.each([
    [401, 'auth'],
    [429, 'rate-limit'],
    [500, 'provider'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const f = fakeFetch(json({ error: { message: 'nope' } }, status))
    await expect(provider(f).complete(ask)).rejects.toMatchObject({ kind })
    expect(f.calls).toHaveLength(1)
  })

  it('explains the local-model causes when a localhost server cannot be reached', async () => {
    const failure = await provider(fakeFetch(new TypeError('Failed to fetch'))).complete(ask).catch((e: unknown) => e)
    expect(failure).toMatchObject({ kind: 'network' })
    for (const hint of ['OLLAMA_ORIGINS', 'Enable CORS', 'Apps on device']) expect((failure as Error).message).toContain(hint)
  })

  it('keeps the local-model advice out of the error for a remote endpoint', async () => {
    const failure = await provider(fakeFetch(new TypeError('Failed to fetch')), { baseUrl: 'https://openrouter.ai/api/v1', model: 'x' }).complete(ask).catch((e: unknown) => e)
    expect(failure).toMatchObject({ kind: 'network', message: expect.stringContaining('https://openrouter.ai') })
    expect((failure as Error).message).not.toContain('OLLAMA_ORIGINS')
  })

  it('tells the player to check the key when OpenAI cannot be reached (it answers a wrong key without CORS headers)', async () => {
    const failure = await provider(fakeFetch(new TypeError('Failed to fetch')), { baseUrl: 'https://api.openai.com/v1', model: 'x', apiKey: 'sk-wrong' }).complete(ask).catch((e: unknown) => e)
    expect(failure).toMatchObject({ kind: 'network', message: expect.stringContaining('check the key') })
  })

  it('surfaces refusals, cut-off answers and replies that are not chat answers', async () => {
    const run = (answer: Response) => provider(fakeFetch(answer)).complete(ask)
    await expect(run(reply(null, 'stop', { refusal: 'I cannot help with that' }))).rejects.toMatchObject({ kind: 'refusal' })
    await expect(run(reply('', 'content_filter'))).rejects.toMatchObject({ kind: 'refusal' })
    await expect(run(reply('half an ans', 'length'))).rejects.toMatchObject({ kind: 'malformed' })
    await expect(run(json({ not: 'a chat answer' }))).rejects.toMatchObject({ kind: 'malformed' })
    await expect(run(new Response('<html>Not Ollama</html>', { status: 200 }))).rejects.toMatchObject({ kind: 'malformed' })
  })

  it("removes a reasoning model's thinking from the text", async () => {
    await expect(provider(fakeFetch(reply('<think>hmm\nlet me see</think>Practise Micro.'))).complete(ask)).resolves.toBe('Practise Micro.')
  })
})
