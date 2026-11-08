import { describe, expect, it } from 'vitest'
import { targetGone } from './hit-sound'

const at = (...ids: number[]) => ids.map((id) => ({ id, yaw: 0, pitch: 0, radius: 1 }))

describe('targetGone', () => {
  it('is true when a target seen last frame is no longer alive (a kill)', () => {
    expect(targetGone([0], at(1))).toBe(true) // Flick: the hit target is replaced by the next one
    expect(targetGone([0, 1], at(1))).toBe(true) // Switch: one of several removed
    expect(targetGone([0], [])).toBe(true)
  })

  it('is false while the same targets are alive, and when targets only appear', () => {
    expect(targetGone([], at(0))).toBe(false) // the first spawn
    expect(targetGone([0], at(0))).toBe(false)
    expect(targetGone([0], at(0, 1))).toBe(false)
    expect(targetGone([], [])).toBe(false)
  })
})
