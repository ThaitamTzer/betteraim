import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY } from './csp'

const directive = (name: string) => CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith(`${name} `))?.split(' ').slice(1) ?? []

describe('Content Security Policy', () => {
  it('lets scripts come from the app only', () => {
    expect(directive('script-src')).toEqual(["'self'"])
    expect(directive('default-src')).toEqual(["'none'"])
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*\.|script-src[^;]*https?:/)
  })

  it('lets the AI Coach reach https providers and local servers, and nothing else', () => {
    const connect = directive('connect-src')
    expect(connect).toEqual(expect.arrayContaining(['https:', 'http://localhost:*', 'http://127.0.0.1:*']))
    expect(connect).not.toContain('http:')
    expect(connect).not.toContain('*')
  })

  it('loads no outside styles, fonts or frames and forbids forms and plugins', () => {
    expect(directive('style-src')).toEqual(["'self'"])
    expect(directive('font-src')).not.toContain('https:')
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('form-action')).toEqual(["'none'"])
  })
})
