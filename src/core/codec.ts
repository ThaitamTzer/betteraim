// Compact, lossless binary form of a Run's raw input stream and target event log (little-endian, one tag byte per
// event, then fixed fields). Input is ~30k mostly `move` events per Run, so a move whose counts are small integers
// takes 13 bytes (tag, t f64, dx i16, dy i16). `movementX/Y` are doubles in the spec, so any other move keeps both
// counts as f64 (25 bytes) and nothing is ever rounded. Everything else is rare and stored as f64.
// shortcut: `t` stays f64 (no delta/varint packing), so ~400 kB per Run; pack it if storage proves too heavy.
import type { RecordedInput, TargetEvent } from './types'

const MOVE_I16 = 0
const MOVE_F64 = 1
const DOWN = 2
const UP = 3
const SPAWN = 0
const SHOT = 1
const KILL = 2

// `v << 16 >> 16` is v only for integers in int16 range; -0, NaN and fractions fail Object.is and go wide.
const fitsI16 = (v: number) => Object.is((v << 16) >> 16, v)

function writer(size: number) {
  const view = new DataView(new ArrayBuffer(size))
  let at = 0
  return {
    u8: (v: number) => view.setUint8(at++, v),
    i16(v: number) {
      view.setInt16(at, v, true)
      at += 2
    },
    f64(v: number) {
      view.setFloat64(at, v, true)
      at += 8
    },
    bytes: () => new Uint8Array(view.buffer),
  }
}

// DataView getters throw RangeError past the end, which is how truncated data is rejected.
function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  return {
    more: () => at < bytes.length,
    u8: () => view.getUint8(at++),
    i16() {
      at += 2
      return view.getInt16(at - 2, true)
    },
    f64() {
      at += 8
      return view.getFloat64(at - 8, true)
    },
  }
}

export function encodeInput(input: readonly RecordedInput[]): Uint8Array {
  const small = (e: RecordedInput) => e.kind === 'move' && fitsI16(e.dx) && fitsI16(e.dy)
  const w = writer(input.reduce((n, e) => n + (e.kind !== 'move' ? 17 : small(e) ? 13 : 25), 0))
  for (const e of input) {
    if (e.kind === 'move') {
      w.u8(small(e) ? MOVE_I16 : MOVE_F64)
      w.f64(e.t)
      if (small(e)) {
        w.i16(e.dx)
        w.i16(e.dy)
      } else {
        w.f64(e.dx)
        w.f64(e.dy)
      }
    } else {
      w.u8(e.kind === 'down' ? DOWN : UP)
      w.f64(e.t)
      w.f64(e.button)
    }
  }
  return w.bytes()
}

export function decodeInput(bytes: Uint8Array): RecordedInput[] {
  const r = reader(bytes)
  const out: RecordedInput[] = []
  while (r.more()) {
    const tag = r.u8()
    const t = r.f64()
    if (tag === MOVE_I16) out.push({ kind: 'move', t, dx: r.i16(), dy: r.i16() })
    else if (tag === MOVE_F64) out.push({ kind: 'move', t, dx: r.f64(), dy: r.f64() })
    else if (tag === DOWN || tag === UP) out.push({ kind: tag === DOWN ? 'down' : 'up', t, button: r.f64() })
    else throw new Error(`Unknown input event tag ${tag}`)
  }
  return out
}

export function encodeTargetEvents(events: readonly TargetEvent[]): Uint8Array {
  const w = writer(events.reduce((n, e) => n + (e.kind === 'spawn' ? 57 : 17), 0))
  for (const e of events) {
    w.u8(e.kind === 'spawn' ? SPAWN : e.kind === 'shot' ? SHOT : KILL)
    w.f64(e.t)
    w.f64(e.id ?? NaN) // a missed shot has no target id; no real id is NaN
    if (e.kind === 'spawn') {
      for (const v of [e.yaw, e.pitch, e.radius, e.crosshair.yaw, e.crosshair.pitch]) w.f64(v)
    }
  }
  return w.bytes()
}

export function decodeTargetEvents(bytes: Uint8Array): TargetEvent[] {
  const r = reader(bytes)
  const out: TargetEvent[] = []
  while (r.more()) {
    const tag = r.u8()
    const t = r.f64()
    const id = r.f64()
    if (tag === SPAWN) {
      out.push({ kind: 'spawn', t, id, yaw: r.f64(), pitch: r.f64(), radius: r.f64(), crosshair: { yaw: r.f64(), pitch: r.f64() } })
    } else if (tag === SHOT) out.push({ kind: 'shot', t, id: Number.isNaN(id) ? null : id })
    else if (tag === KILL) out.push({ kind: 'kill', t, id })
    else throw new Error(`Unknown target event tag ${tag}`)
  }
  return out
}

// A single export file is JSON, so its binary parts travel as base64 text (+33%). The core has no btoa/Buffer.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET.charAt(n >> 18) + ALPHABET.charAt((n >> 12) & 63)
    out += i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '='
    out += i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '='
  }
  return out
}

export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Not valid base64')
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const out = new Uint8Array((text.length / 4) * 3 - padding)
  for (let i = 0, o = 0; i < text.length; i += 4) {
    let n = 0
    for (let j = 0; j < 4; j++) n = (n << 6) | Math.max(0, ALPHABET.indexOf(text.charAt(i + j)))
    for (let shift = 16; shift >= 0 && o < out.length; shift -= 8) out[o++] = (n >> shift) & 255
  }
  return out
}
