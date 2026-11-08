import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The headless core must stay free of DOM, WebGL and React and must stay deterministic.
// tsconfig.core.json (no DOM lib) catches DOM globals; this catches imports and clock/random use.
const coreDir = join(import.meta.dirname, 'core')
const files = readdirSync(coreDir, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(f))
  .map((f) => ({ name: f.replaceAll('\\', '/'), source: readFileSync(join(coreDir, f), 'utf8') }))

/** Drops comments but keeps string and template literals whole, so a `//` inside a string (`'http://x'`) hides nothing after it. */
const stripComments = (s: string): string =>
  s.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (_, literal: string | undefined) => literal ?? '')

/** Every module specifier: static `import ... from`, bare `import 'x'`, `export ... from`, dynamic `import('x')` and `require('x')`. */
const specifiers = (source: string): string[] =>
  [...stripComments(source).matchAll(/\b(?:from|import|require)\s*\(?\s*(['"])([^'"\n]+)\1/g)].map((m) => m[2] ?? '')

describe('src/core boundary', () => {
  it('finds the core sources', () => {
    expect(files.length).toBeGreaterThan(5)
    expect(files.some((f) => f.name.endsWith('.test.ts'))).toBe(true)
    expect(files.some((f) => f.name.startsWith('finder/') && f.name.endsWith('model.ts'))).toBe(true) // subdirectories too
  })

  it('imports only other core files (tests may also import vitest)', () => {
    for (const { name, source } of files) {
      const allowed = name.endsWith('.test.ts') ? ['vitest'] : []
      for (const spec of specifiers(source)) {
        expect(spec.startsWith('.') || allowed.includes(spec), `${name} imports '${spec}'`).toBe(true)
      }
    }
  })

  it('has no clock or randomness other than the seeded rng, tests included (a timing assertion is a flaky test)', () => {
    for (const { name, source } of files) {
      expect(stripComments(source), name).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\b|\bDate\(|crypto\./)
    }
  })

  describe('its own checks', () => {
    const uncovered = (source: string) => specifiers(source).filter((spec) => !spec.startsWith('.'))

    it('see dynamic imports, require and re-exports, not only static imports', () => {
      expect(uncovered(`const m = await import('three')`)).toEqual(['three'])
      expect(uncovered(`const m = await import( "react" )`)).toEqual(['react'])
      expect(uncovered(`const fs = require('node:fs')`)).toEqual(['node:fs'])
      expect(uncovered(`export { x } from 'lodash'`)).toEqual(['lodash'])
      expect(uncovered(`import 'side-effect'`)).toEqual(['side-effect'])
      expect(uncovered(`import { a } from './a'\nimport type { B } from '../b'`)).toEqual([])
    })

    it('are not blinded by a // inside a string, and ignore imports in comments', () => {
      expect(uncovered(`const url = 'http://example.com'; import('three')`)).toEqual(['three'])
      expect(uncovered(`const url = "https://x.y/z"\nimport x from 'react'`)).toEqual(['react'])
      expect(uncovered(`// import x from 'react'\n/* import('three') */\nconst ok = 1`)).toEqual([])
      expect(stripComments(`const a = 'a // b' // c\nconst d = 1`)).toBe(`const a = 'a // b' \nconst d = 1`)
    })
  })
})
