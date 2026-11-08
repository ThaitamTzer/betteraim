import type { ReactElement } from 'react'
import type { RunMeta, RunParams, RunRecord } from '../core'

/**
 * Every screen of the app. To add a screen: add a member here, a component in screens/, and one line to
 * `screens` in App.tsx. Screens move around with `go(route)`; routes live in memory (no URL routing).
 */
export type Route =
  | { name: 'home' }
  | {
      name: 'run'
      params: RunParams
      /** Everything about the Run that is not core input; the id and start time are added when it starts. */
      meta: Omit<RunMeta, 'id' | 'startedAt'>
      /** Where to go when the Run ends; a Finder Session would chain the next Run here. */
      next: (record: RunRecord) => Route
    }
  | { name: 'result'; record: RunRecord; again: Route }

export type Go = (route: Route) => void

export type ScreenProps<N extends Route['name']> = { route: Extract<Route, { name: N }>; go: Go }
export type Screens = { [N in Route['name']]: (props: ScreenProps<N>) => ReactElement }
