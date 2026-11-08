import { CoachError } from './provider'
import type { CoachProvider, CoachRequest, JsonSchema } from './provider'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const typeMatches = (type: unknown, v: unknown): boolean =>
  type === 'object' ? isObject(v)
  : type === 'array' ? Array.isArray(v)
  : type === 'string' ? typeof v === 'string'
  : type === 'number' ? typeof v === 'number' && Number.isFinite(v)
  : type === 'integer' ? Number.isInteger(v)
  : type === 'boolean' ? typeof v === 'boolean'
  : type === 'null' ? v === null
  : true

/**
 * Where `value` breaks `schema`, or null. Checks `type`, `enum`, `properties`, `required`, `additionalProperties: false` and
 * `items`: what structured-output endpoints accept (they reject numeric ranges and the like, so ranges are checked by the caller).
 * shortcut: no `$ref`, `anyOf` or `pattern`; add them if a schema needs them.
 */
export function schemaError(schema: JsonSchema, value: unknown, at = 'reply'): string | null {
  if (!typeMatches(schema.type, value)) return `${at} should be of type ${String(schema.type)}`
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${at} is not one of the allowed values`
  if (isObject(value)) {
    const props = isObject(schema.properties) ? schema.properties : {}
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!(key in value)) return `${at}.${String(key)} is missing`
    }
    for (const [key, v] of Object.entries(value)) {
      const sub = props[key]
      if (!isObject(sub)) {
        if (schema.additionalProperties === false) return `${at}.${key} is not expected`
        continue
      }
      const problem = schemaError(sub, v, `${at}.${key}`)
      if (problem) return problem
    }
  }
  if (Array.isArray(value) && isObject(schema.items)) {
    for (const [i, v] of value.entries()) {
      const problem = schemaError(schema.items, v, `${at}[${i}]`)
      if (problem) return problem
    }
  }
  return null
}

/** Models sometimes wrap JSON in a ```json fence even when told not to. */
const unfence = (text: string): string => text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

/**
 * The structured operation of the port: asks for a reply of `schema` and returns it parsed. The prompt always says so too
 * (a local model may ignore the adapter's constraint). Anything that is not JSON of that schema is `malformed` output;
 * no retry happens here, the caller decides what a bad answer means.
 */
export async function askJson(
  provider: CoachProvider,
  { system, prompt, name, schema }: Pick<CoachRequest, 'system' | 'prompt'> & { name: string; schema: JsonSchema },
): Promise<unknown> {
  const text = await provider.complete({
    system,
    prompt: `${prompt}\n\nReply with only a JSON document of this JSON Schema, no other text:\n${JSON.stringify(schema)}`,
    json: { name, schema },
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(unfence(text))
  } catch {
    throw new CoachError('malformed', 'The AI Coach did not answer in the format asked for (the reply was not JSON).')
  }
  const problem = schemaError(schema, parsed)
  if (problem) throw new CoachError('malformed', `The AI Coach did not answer in the format asked for (${problem}).`)
  return parsed
}
