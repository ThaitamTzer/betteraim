import { describe, expect, it } from 'vitest'
import { coarseLevels, getScenario, planSession } from '../index'
import type { PlannedRun, ScenarioId } from '../index'

const CENTRE = 40
const WEIGHTS = { clicking: 0.7, tracking: 0.3 }
const plan = (seed: number, over: Partial<Parameters<typeof planSession>[0]> = {}) =>
  planSession({ centre: CENTRE, levels: coarseLevels(CENTRE), weights: WEIGHTS, seed, ...over })

const counted = (runs: PlannedRun[]) => runs.filter((r) => !r.warmup)
const scenariosOf = (runs: PlannedRun[]): ScenarioId[] => [...new Set(counted(runs).map((r) => r.scenario))]

describe('coarse levels', () => {
  it('are the centre times 2^(k/3) for k = -3 ... 3', () => {
    const levels = coarseLevels(CENTRE)
    expect(levels).toHaveLength(7)
    // worked values, not recomputed with the formula: x0.5, x0.7937, x0.7937*1.26 = x0.63 ... x2
    expect(levels[0]).toBeCloseTo(20, 9)
    expect(levels[1]).toBeCloseTo(25.1984, 3)
    expect(levels[2]).toBeCloseTo(31.748, 3)
    expect(levels[3]).toBe(CENTRE)
    expect(levels[4]).toBeCloseTo(50.397, 3)
    expect(levels[5]).toBeCloseTo(63.496, 3)
    expect(levels[6]).toBeCloseTo(80, 9)
  })
})

describe('a Session plan', () => {
  it('is 2 Warm-up Runs followed by 2 Scenarios x 7 levels', () => {
    const runs = plan(1)
    expect(runs).toHaveLength(16)
    expect(runs.slice(0, 2).every((r) => r.warmup)).toBe(true)
    expect(runs.slice(2).every((r) => !r.warmup)).toBe(true)
  })

  it('plays each of the 2 different Scenarios once at every level', () => {
    for (let seed = 0; seed < 50; seed++) {
      const runs = counted(plan(seed))
      const played = scenariosOf(runs)
      expect(played).toHaveLength(2)
      for (const scenario of played) {
        const sensitivities = runs.filter((r) => r.scenario === scenario).map((r) => r.sensitivity)
        expect(sensitivities.sort((a, b) => a - b)).toEqual(coarseLevels(CENTRE))
      }
    }
  })

  it('warms up at the centre Sensitivity, once in each Scenario of the Session', () => {
    const runs = plan(7)
    const warmups = runs.filter((r) => r.warmup)
    expect(warmups.map((r) => r.sensitivity)).toEqual([CENTRE, CENTRE])
    expect(warmups.map((r) => r.scenario).sort()).toEqual(scenariosOf(runs).sort())
  })

  it('takes its levels as input, so a later phase can play other levels', () => {
    const runs = plan(3, { levels: [10, 20, 30, 40, 50], centre: 30 })
    expect(runs).toHaveLength(2 + 2 * 5)
    expect(counted(runs).map((r) => r.sensitivity).sort((a, b) => a - b)).toEqual([10, 10, 20, 20, 30, 30, 40, 40, 50, 50])
    expect(runs.filter((r) => r.warmup).map((r) => r.sensitivity)).toEqual([30, 30])
  })
})

describe('seeds', () => {
  it('are shared by every level of a Scenario within the Session', () => {
    for (let seed = 0; seed < 50; seed++) {
      const runs = counted(plan(seed))
      for (const scenario of scenariosOf(runs)) {
        expect(new Set(runs.filter((r) => r.scenario === scenario).map((r) => r.seed)).size).toBe(1)
      }
    }
  })

  it('differ between the Scenarios, and a Warm-up Run never replays the counted target sequence', () => {
    const runs = plan(11)
    const seeds = runs.map((r) => r.seed)
    expect(new Set(seeds).size).toBe(4) // 2 Scenarios + 2 warm-ups, each with its own
    const countedSeeds = new Set(counted(runs).map((r) => r.seed))
    expect(runs.filter((r) => r.warmup).some((r) => countedSeeds.has(r.seed))).toBe(false)
  })
})

describe('determinism and order', () => {
  it('gives the same plan for the same Session seed and another for another seed', () => {
    expect(plan(42)).toEqual(plan(42))
    expect(plan(42)).not.toEqual(plan(43))
  })

  it('shuffles the counted Runs: any (Scenario, level) can come first or last', () => {
    const first = new Set<string>()
    const last = new Set<string>()
    for (let seed = 0; seed < 300; seed++) {
      const runs = counted(plan(seed))
      const key = (r: PlannedRun | undefined) => `${r?.scenario}@${r ? Math.round(r.sensitivity) : ''}`
      first.add(key(runs[0]))
      last.add(key(runs.at(-1)))
    }
    expect(first.size).toBeGreaterThan(20)
    expect(last.size).toBeGreaterThan(20)
  })
})

describe('the Scenario draw', () => {
  const share = (weights: { clicking: number; tracking: number }, plans = 4000) => {
    let clicking = 0
    for (let seed = 0; seed < plans; seed++) {
      for (const s of scenariosOf(plan(seed, { weights }))) if (getScenario(s).category === 'clicking') clicking++
    }
    return clicking / (2 * plans)
  }

  it('follows the Game Profile weights over many plans', () => {
    expect(Math.abs(share({ clicking: 0.7, tracking: 0.3 }) - 0.7)).toBeLessThan(0.02)
    expect(Math.abs(share({ clicking: 0.3, tracking: 0.7 }) - 0.3)).toBeLessThan(0.02)
    expect(Math.abs(share({ clicking: 0.5, tracking: 0.5 }) - 0.5)).toBeLessThan(0.02)
  })

  it('draws every Scenario of a category, not always the same one', () => {
    const seen = new Set<ScenarioId>()
    for (let seed = 0; seed < 200; seed++) for (const s of scenariosOf(plan(seed))) seen.add(s)
    expect([...seen].sort()).toEqual(['flick', 'micro', 'strafe', 'switch'])
  })

  it('never draws a category with weight 0', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(scenariosOf(plan(seed, { weights: { clicking: 1, tracking: 0 } })).sort()).toEqual(['flick', 'micro'])
    }
  })
})
