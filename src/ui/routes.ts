import type { ReactElement } from 'react'
import type { Fov, RunMeta, RunParams, RunRecord } from '../core'

/**
 * Every screen of the app. To add a screen: add a member here, a component in screens/, and one line to
 * `screens` in App.tsx. Screens move around with `go(route)`; routes live in memory (no URL routing).
 */
export type Route =
  | { name: 'home' }
  | { name: 'runs' }
  | { name: 'history' }
  /** The Session summary of one Session (Finder or Practice); `back` is where its Back button goes. */
  | { name: 'session'; sessionId: string; back: Route }
  | { name: 'onboarding' }
  | { name: 'converter' }
  | { name: 'options' }
  /**
   * Scenario picker; a chosen Scenario is played as a Practice Run with these settings (from the active Game Profile).
   * `sessionId` is the Practice Session to carry on; the picker makes a new one when it is absent (it opens from Home).
   */
  | { name: 'practice'; sensitivity: number; dpi: number; fov: Fov; gameProfileId: string; sessionId?: string }
  | {
      name: 'run'
      params: RunParams
      /** Everything about the Run that is not core input; the id, start time and capture env are added when it starts. */
      meta: Omit<RunMeta, 'id' | 'startedAt' | 'env'>
      /** Where to go when the Run ends; a Finder Session would chain the next Run here. */
      next: (record: RunRecord) => Route
    }
  /** `more` goes to the next pick of the same Session (the Practice picker); absent when the Session has no picker. */
  | { name: 'result'; record: RunRecord; again: Route; more?: Route }

export type Go = (route: Route) => void

export type ScreenProps<N extends Route['name']> = { route: Extract<Route, { name: N }>; go: Go }
export type Screens = { [N in Route['name']]: (props: ScreenProps<N>) => ReactElement }
