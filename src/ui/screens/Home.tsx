import { useState } from 'react'
import { degreesPerCount } from '../../core'
import { rawInputLikelySupported } from '../../input/pointer'
import type { ScreenProps } from '../routes'

export function Home({ go }: ScreenProps<'home'>) {
  const [cm360, setCm360] = useState('30')
  const [dpi, setDpi] = useState('800')
  const sensitivity = Number(cm360)
  const mouseDpi = Number(dpi)
  const valid = sensitivity > 0 && sensitivity <= 1000 && mouseDpi >= 100 && mouseDpi <= 32000

  return (
    <main className="page">
      <h1>Find the sensitivity you aim best with.</h1>
      <p className="lede">
        A free aim trainer in your browser. Tell it your mouse setup, then practice a Scenario and see your Score.
      </p>

      {!rawInputLikelySupported() && (
        <p className="warning" role="status">
          This browser may not give raw mouse input, so the OS can accelerate your mouse and distort results. Chrome, Edge
          and other Chromium browsers support raw input. You can still play.
        </p>
      )}

      <form
        className="setup"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) go({ name: 'practice', sensitivity, dpi: mouseDpi })
        }}
      >
        <label>
          <span>Sensitivity</span>
          <span className="field">
            <input type="number" inputMode="decimal" step="any" min="0.1" value={cm360} onChange={(e) => setCm360(e.target.value)} />
            <span className="unit">cm/360</span>
          </span>
        </label>
        <label>
          <span>Mouse DPI</span>
          <span className="field">
            <input type="number" inputMode="numeric" step="any" min="100" value={dpi} onChange={(e) => setDpi(e.target.value)} />
            <span className="unit">DPI</span>
          </span>
        </label>
        <p className="hint">
          {valid
            ? `Each mouse count turns the view ${degreesPerCount(sensitivity, mouseDpi).toFixed(4)} degrees.`
            : 'Enter a sensitivity above 0 and a DPI between 100 and 32000.'}
        </p>
        <button type="submit" className="primary" disabled={!valid}>
          Practice
        </button>
      </form>
    </main>
  )
}
