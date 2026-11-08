import type { AimMovement, RunAnalysis } from '../analysis'
import type { AnalysedRun } from '../aggregate'
import type { RunSummary } from '../storage'

/**
 * A stand-in Analysis for a synthetic Run (tests only: `syntheticRuns` makes Runs without playing them). Faster Sensitivities overshoot more
 * and slower ones undershoot, and a Clicking Run carries real-looking Aim Movements, so a payload that let them through would show.
 * Deterministic from the Run's Sensitivity alone.
 */
export function syntheticAnalysis(run: RunSummary): RunAnalysis {
  const speed = Math.max(0, Math.min(1, Math.log2(run.sensitivity / 20) / 2)) // 0 at 20 cm/360 and under (fast), 1 at 80 and over (slow)
  const over = Math.round(8 * (1 - speed)) // of 10 Aim Movements
  const under = Math.round(8 * speed)
  if (run.scenario === 'strafe' || run.scenario === 'switch') {
    return { category: 'tracking', meanOffset: 0.6 - 1.2 * speed, lead: 'level', samples: 4000, timeOnTargetMs: 12000, timeOnTargetShare: 0.4, mouseSpeed: 20 }
  }
  const movements: AimMovement[] = Array.from({ length: 10 }, (_, i) => ({
    targetId: i,
    startMs: i * 1000,
    endMs: i * 1000 + 400,
    idealDistance: 20,
    pathLength: 22,
    primaryEndAlong: 20,
    outcome: i < over ? 'overshoot' : i >= 10 - under ? 'undershoot' : 'on-target',
    pathDeviation: 1 + speed,
    velocityPeaks: 1 + (i % 2),
  }))
  return {
    category: 'clicking',
    movements,
    movementCount: 10,
    shots: 12,
    hits: 10,
    accuracy: 10 / 12,
    mouseSpeed: 55,
    overshoots: over,
    undershoots: under,
    overshootRate: over / 10,
    undershootRate: under / 10,
    pathDeviation: 1 + speed,
    smoothness: 1.5,
  }
}

export const analysedSynthetic = (runs: readonly RunSummary[]): AnalysedRun[] => runs.map((run) => ({ run, analysis: syntheticAnalysis(run) }))
