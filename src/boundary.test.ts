import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The headless core must stay free of DOM, WebGL and React and must stay deterministic.
// tsconfig.core.json (no DOM lib) catches DOM globals; this catches imports and clock/random use.
const coreDir = join(import.meta.dirname, 'core')
const files = readdirSync(coreDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f.replaceAll('\\', '/'), source: readFileSync(join(coreDir, f), 'utf8') }))
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('src/core boundary', () => {
  it('finds the core sources', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('imports only other core files (tests may also import vitest)', () => {
    for (const { name, source } of files) {
      const allowed = name.endsWith('.test.ts') ? ['vitest'] : []
      const imports = [...stripComments(source).matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '')
      for (const spec of imports) {
        expect(spec.startsWith('.') || allowed.includes(spec), `${name} imports '${spec}'`).toBe(true)
      }
    }
  })

  it('has no clock or randomness other than the seeded rng in non-test code', () => {
    for (const { name, source } of files.filter((f) => !f.name.endsWith('.test.ts'))) {
      expect(stripComments(source), name).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\b|crypto\./)
    }
  })
})
