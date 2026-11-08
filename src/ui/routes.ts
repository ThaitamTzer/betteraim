import type { ReactElement } from 'react'
import type { Fov, RunMeta, RunParams, RunRecord } from '../core'
import type { FinderSession, FinderStep } from './finder'

/**
 * Every screen of the app. To add a screen: add a member here, a component in screens/, and one line to
 * `screens` in App.tsx. Screens move around with `go(route)`; routes live in memory (no URL routing).
 */
export type Route =
  | { name: 'home' }
  | { name: 'runs' }
  | { name: 'onboarding' }
  | { name: 'converter' }
  | { name: 'options' }
  /** Scenario picker; a chosen Scenario is played as a Practice Run with these settings (from the active Game Profile). */
  | { name: 'practice'; sensitivity: number; dpi: number; fov: Fov; gameProfileId: string }
  | {
      name: 'run'
      params: RunParams
      /** Everything about the Run that is not core input; the id, start time and capture env are added when it starts. */
      meta: Omit<RunMeta, 'id' | 'startedAt' | 'env'>
      /** Where to go when the Run ends; a Finder Session chains the next Run here. */
      next: (record: RunRecord) => Route
      /**
       * Set for a Finder Run. Escape then abandons just this Run and goes to `onAbandon` (Practice retries in place),
       * and a lock that is not raw never starts the Run and goes to `onNotRaw`. `label` is the progress shown on the start card.
       */
      session?: { label: string; onAbandon: Route; onNotRaw: Route }
    }
  /** Sensitivity Finder entry: what a Session is, then Start. */
  | { name: 'finder' }
  /** Between the Runs of a Finder Session; `last` is the Run that just finished (rest only). The topbar is hidden here. */
  | { name: 'finderSession'; session: FinderSession; step: FinderStep; last?: RunRecord }
  | { name: 'result'; record: RunRecord; again: Route }

export type Go = (route: Route) => void

export type ScreenProps<N extends Route['name']> = { route: Extract<Route, { name: N }>; go: Go }
export type Screens = { [N in Route['name']]: (props: ScreenProps<N>) => ReactElement }
