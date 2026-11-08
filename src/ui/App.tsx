import { useState } from 'react'
import type { ReactElement } from 'react'
import { Home } from './screens/Home'
import { Converter } from './screens/Converter'
import { Onboarding } from './screens/Onboarding'
import { Result } from './screens/Result'
import { RunScreen } from './screens/RunScreen'
import type { Go, Route, ScreenProps, Screens } from './routes'
import './app.css'

const screens: Screens = {
  home: Home,
  onboarding: Onboarding,
  converter: Converter,
  run: RunScreen,
  result: Result,
}

export function App() {
  // `key` changes on every navigation so a screen is remounted even when the next route has the same name
  const [{ route, key }, setNav] = useState<{ route: Route; key: number }>({ route: { name: 'home' }, key: 0 })
  const go: Go = (next) => setNav((s) => ({ route: next, key: s.key + 1 }))
  // TypeScript cannot correlate `route.name` with its component, hence the single cast
  const Screen = screens[route.name] as (props: ScreenProps<Route['name']>) => ReactElement
  return (
    <>
      {route.name !== 'run' && (
        <header className="topbar">
          <button type="button" className="brand" onClick={() => go({ name: 'home' })}>
            BetterAim
          </button>
        </header>
      )}
      <Screen key={key} route={route} go={go} />
    </>
  )
}
