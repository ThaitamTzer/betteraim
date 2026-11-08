import { describe, expect, it } from 'vitest'
import { degreesPerCount, wrapDeg } from '../aim'
import type { RunResult } from '../types'
import { aimBot, runBot, trackBot } from './bots'
import type { Bot } from './bots'
import { testParams } from './params'

const params = testParams()
const perCount = degreesPerCount(params.sensitivity, params.dpi)

/** How far along the straight line to the first target the crosshair is, as a fraction of the distance, over time. */
const progressToFirstTarget = (result: RunResult) => {
  const spawn = result.targetEvents[0]
  if (spawn?.kind !== 'spawn') throw new Error('no spawn')
  const distance = Math.hypot(spawn.yaw, spawn.pitch)
  let yaw = 0
  let pitch = 0
  const samples: { t: number; progress: number }[] = []
  for (const e of result.input) {
    if (e.kind === 'down') break
    if (e.kind !== 'move') continue
    yaw += e.dx * perCount
    pitch -= e.dy * perCount
    samples.push({ t: e.t, progress: (yaw * spawn.yaw + pitch * spawn.pitch) / distance ** 2 })
  }
  return samples
}

describe('runBot', () => {
  it('turns degrees into integer counts and carries the remainder, so slow movement does not drift', () => {
    const slow: Bot = (state) => (state.t < 1000 ? { turn: { yaw: 0.01, pitch: 0 } } : undefined)
    const { input } = runBot(params, slow)
    const counts = input.flatMap((e) => (e.kind === 'move' ? [e.dx] : []))
    expect(counts.every(Number.isInteger)).toBe(true)
    // 1000 ticks x 0.01 degrees = 10 degrees (the last tick at 1000 ms is not turned)
    expect(counts.reduce((a, b) => a + b, 0) * perCount).toBeCloseTo(9.99, 1)
  })

  it('emits button events on the edges of the held state', () => {
    const clicker: Bot = (state) => ({ fire: Math.floor(state.t / 10) % 2 === 0 && state.t < 40 })
    const { input } = runBot(params, clicker)
    expect(input.filter((e) => e.kind !== 'move').map((e) => [e.kind, e.t])).toEqual([
      ['down', 0],
      ['up', 10],
      ['down', 20],
      ['up', 30],
    ])
  })
})

describe('aimBot', () => {
  it('with gain 1.3 overshoots the first target by 30%, then corrects back', () => {
    const progress = progressToFirstTarget(runBot(params, aimBot({ gain: 1.3 }))).map((s) => s.progress)
    expect(Math.max(...progress)).toBeCloseTo(1.3, 1)
    expect(progress.at(-1)).toBeCloseTo(1, 1)
  })

  it('with gain 0.7 stops short at 70% of the way before correcting', () => {
    const samples = progressToFirstTarget(runBot(params, aimBot({ gain: 0.7, moveMs: 120 })))
    expect(samples.findLast((s) => s.t <= 120)?.progress).toBeCloseTo(0.7, 1)
    expect(samples.at(-1)?.progress).toBeCloseTo(1, 1)
  })

  it('waits for its reaction time before moving', () => {
    const first = runBot(params, aimBot({ reactionMs: 250 })).input.find((e) => e.kind === 'move')
    expect(first?.t).toBeGreaterThanOrEqual(250)
  })
})

describe('trackBot', () => {
  /** Mean signed offset of the crosshair from the Strafe target along the target's heading, and the target's mean speed. */
  const offsets = (bot: Bot) => {
    let ahead = 0
    let speed = 0
    let n = 0
    runBot(testParams({ scenario: 'strafe' }), (state) => {
      const target = state.targets[0]
      if (target?.heading !== undefined && target.speed !== undefined && state.t > 0) {
        const heading = (target.heading * Math.PI) / 180
        const east = wrapDeg(state.crosshair.yaw - target.yaw) * Math.cos((target.pitch * Math.PI) / 180)
        const north = state.crosshair.pitch - target.pitch
        ahead += east * Math.sin(heading) + north * Math.cos(heading)
        speed += target.speed
        n++
      }
      return bot(state)
    })
    return { ahead: ahead / n, speed: speed / n }
  }

  it('is dead on the target by default (it sees the target 1 ms late, about 0.02 degrees)', () => {
    expect(Math.abs(offsets(trackBot()).ahead)).toBeLessThan(0.05)
  })

  it('leads the target by its speed times leadMs: Ahead', () => {
    const { ahead, speed } = offsets(trackBot({ leadMs: 100 }))
    expect(ahead).toBeCloseTo(speed * 0.1, 1)
    expect(ahead).toBeGreaterThan(1)
  })

  it('trails the target by its speed times leadMs when that is negative: Behind', () => {
    const { ahead, speed } = offsets(trackBot({ leadMs: -100 }))
    expect(ahead).toBeCloseTo(-speed * 0.1, 1)
    expect(ahead).toBeLessThan(-1)
  })
})
