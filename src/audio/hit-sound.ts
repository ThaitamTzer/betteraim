import type { Target } from '../core'

/** True when a target alive last frame is gone now, i.e. the Scenario killed it (a hit). The shell reads this from RunState. */
export const targetGone = (before: readonly number[], now: readonly Target[]): boolean =>
  before.some((id) => !now.some((t) => t.id === id))

/** A short synthesized tick for a hit (no asset files). The AudioContext is made by `prime`, which needs a user gesture. */
export function createHitSound() {
  let ctx: AudioContext | undefined
  return {
    /** Call from a click handler: browsers keep an AudioContext silent until the page has had a gesture. */
    prime() {
      ctx ??= new AudioContext()
      void ctx.resume()
    },
    /** `volume` is 0 to 1. Silent until `prime` was called. */
    play(volume: number) {
      if (!ctx || volume <= 0) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.setValueAtTime(1400, now)
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.06)
      gain.gain.setValueAtTime(volume * 0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.1)
    },
    close() {
      void ctx?.close()
      ctx = undefined
    },
  }
}
