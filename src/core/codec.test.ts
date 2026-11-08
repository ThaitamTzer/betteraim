import { describe, expect, it } from 'vitest'
import { decodeInput, decodeTargetEvents, encodeInput, encodeTargetEvents, fromBase64, toBase64 } from './index'
import { aimBot, runBot } from './testing/bots'
import { testParams } from './testing/params'
import type { RecordedInput, TargetEvent } from './types'

describe('binary Run data', () => {
  it('round-trips a real Run exactly and is far smaller than JSON', () => {
    const { input, targetEvents } = runBot(testParams({ seed: 7 }), aimBot())
    expect(input.length).toBeGreaterThan(100)

    const bytes = encodeInput(input)
    expect(decodeInput(bytes)).toEqual(input)
    expect(bytes.length).toBeLessThan(JSON.stringify(input).length / 2)
    expect(decodeTargetEvents(encodeTargetEvents(targetEvents))).toEqual(targetEvents)
  })

  it('is lossless for awkward numbers: fractional, huge, negative zero and non-integer counts', () => {
    const input: RecordedInput[] = [
      { kind: 'move', t: 0.1 + 0.2, dx: 3, dy: -4 },
      { kind: 'move', t: 1.5, dx: -32768, dy: 32767 },
      { kind: 'move', t: 2, dx: 32768, dy: -32769 },
      { kind: 'move', t: 3, dx: 0.3, dy: -1.25 },
      { kind: 'move', t: 4, dx: -0, dy: 1e9 },
      { kind: 'down', t: 5.0000001, button: 0 },
      { kind: 'up', t: 6, button: 4 },
    ]
    expect(decodeInput(encodeInput(input))).toEqual(input)

    const events: TargetEvent[] = [
      { kind: 'spawn', t: 1 / 3, id: 0, yaw: -170.123456789, pitch: 45.5, radius: 2.5, crosshair: { yaw: 1e-9, pitch: -89 } },
      { kind: 'shot', t: 2, id: null },
      { kind: 'shot', t: 3, id: 0 },
      { kind: 'kill', t: 3, id: 0 },
    ]
    expect(decodeTargetEvents(encodeTargetEvents(events))).toEqual(events)
  })

  it('round-trips empty streams', () => {
    expect(decodeInput(encodeInput([]))).toEqual([])
    expect(decodeTargetEvents(encodeTargetEvents([]))).toEqual([])
  })

  it('rejects truncated or unknown data instead of guessing', () => {
    const bytes = encodeInput([{ kind: 'move', t: 1, dx: 2, dy: 3 }])
    expect(() => decodeInput(bytes.slice(0, bytes.length - 1))).toThrow()
    expect(() => decodeInput(new Uint8Array([9, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow()
    expect(() => decodeTargetEvents(new Uint8Array([9]))).toThrow()
  })
})

describe('base64', () => {
  it('round-trips every byte value and every padding length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 256]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7 + 200) & 255)
      expect(fromBase64(toBase64(bytes))).toEqual(bytes)
    }
  })

  it('matches the standard encoding', () => {
    expect(toBase64(new TextEncoder().encode('Many hands make light work.'))).toBe('TWFueSBoYW5kcyBtYWtlIGxpZ2h0IHdvcmsu')
    expect(toBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
  })

  it('rejects text that is not base64', () => {
    for (const bad of ['abc', 'ab!d', 'ab=d', 'a===']) expect(() => fromBase64(bad), bad).toThrow()
  })
})
