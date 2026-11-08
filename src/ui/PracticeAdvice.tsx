import { useState } from 'react'
import type { ReactNode } from 'react'
import { coachFailureMessage, createCoachProvider, loadCoachSettings, missingSetup } from '../coach/settings'
import { practiceAdvice } from '../core'
import type { AnalysedRun } from '../core'
import './coach.css'

type State = { phase: 'idle' } | { phase: 'asking' } | { phase: 'done'; text: string } | { phase: 'failed'; message: string }

/**
 * Written training advice from the AI Coach on a Practice Session. It asks only when the button is pressed, once per press,
 * and shows the answer or the error right here. `children` (the screen's Back button) sit in the same row as the button.
 */
export function PracticeAdvice({ items, onSetup, children }: { items: readonly AnalysedRun[]; onSetup: () => void; children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const missing = missingSetup(loadCoachSettings())

  const ask = async () => {
    const settings = loadCoachSettings()
    const provider = createCoachProvider(settings)
    if (!provider) return
    setState({ phase: 'asking' })
    try {
      setState({ phase: 'done', text: await practiceAdvice(provider, { items, language: settings.language }) })
    } catch (error) {
      setState({ phase: 'failed', message: await coachFailureMessage(error, settings) })
    }
  }

  return (
    <section className="advice">
      <h2>Training advice</h2>
      <p className="hint">
        The AI Coach reads this Session's Analysis figures, never your raw mouse data, and writes advice on what to practise. It is asked only when you press the button, using your own
        key or local model.
      </p>
      {missing !== null && (
        <p className="hint">
          {missing} to use it.{' '}
          <button type="button" className="link" onClick={onSetup}>
            Open Options
          </button>
        </p>
      )}
      <div role="status">
        {state.phase === 'asking' && <p className="hint">Asking the AI Coach...</p>}
        {state.phase === 'done' && <div className="coach-answer">{state.text}</div>}
      </div>
      {state.phase === 'failed' && <p className="warning" role="alert">{state.message}</p>}
      <div className="actions">
        <button type="button" className="primary" disabled={missing !== null || state.phase === 'asking'} onClick={() => void ask()}>
          {state.phase === 'done' || state.phase === 'failed' ? 'Ask again' : 'Get training advice'}
        </button>
        {children}
      </div>
    </section>
  )
}
