import type { RunMeta, RunParams } from '../types'

export const testParams = (overrides: Partial<RunParams> = {}): RunParams => ({
  scenario: 'flick',
  seed: 1,
  sensitivity: 25.4,
  dpi: 800,
  fov: { degrees: 103, axis: 'horizontal' },
  ...overrides,
})

export const testMeta = (overrides: Partial<RunMeta> = {}): RunMeta => ({
  id: 'run-1',
  startedAt: 0,
  gameProfileId: 'test',
  mode: 'practice',
  warmup: false,
  sessionId: 'session-1',
  env: { devicePixelRatio: 1, userAgent: 'test', rawInput: true },
  ...overrides,
})
