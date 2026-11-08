import type { FinderFit } from '../core'
import type { CoachAsk } from './useCoachChoice'
import './coach.css'

/**
 * The AI Coach on the Finder result: the button that asks it for the Recommended Sensitivity, what it is doing while it works, its
 * reasons, and the notice when the Curve Peak is shown because it failed. Without an AI Coach it points to Options instead. The
 * Sensitivity itself (cm/360, Game Sensitivity, eDPI) is shown by the screen, from the same answer.
 */
export function CoachPanel({ fit, coach, onSetup }: { fit: FinderFit; coach: CoachAsk; onSetup: () => void }) {
  const { choice, state, missing, canAsk, ask } = coach
  if (fit.peak === null) return null
  if (missing !== null) {
    return (
      <p className="hint">
        This is the Curve Peak, the statistically best Sensitivity. Connect an AI Coach and it will choose inside the interval and explain why.{' '}
        <button type="button" className="link" onClick={onSetup}>
          Open Options
        </button>
      </p>
    )
  }
  if (!canAsk) return null // no interval yet: the result message says to play another Session

  const busy = state.phase === 'analysing' || state.phase === 'asking'
  const answered = choice?.source === 'coach'
  const failed = state.phase === 'failed' || choice?.notice !== undefined
  return (
    <section className="advice">
      <h2>AI Coach</h2>
      <p className="hint">
        {answered
          ? "The AI Coach chose inside the interval of the Curve Peak. Its answer is kept for this data: a new Run, or a change of model, language or Player Context, asks again."
          : "The AI Coach reads your aggregate figures per Sensitivity (never your raw mouse data), chooses inside the interval of the Curve Peak and explains why. It is asked only when you press the button, using your own key or local model."}
      </p>
      <div role="status">
        {state.phase === 'analysing' && (
          <p className="hint">
            Analysing your Runs ({state.done} of {state.total})... The first time takes a few seconds.
          </p>
        )}
        {state.phase === 'asking' && <p className="hint">Asking the AI Coach...</p>}
      </div>
      {answered && (
        <div className="coach-answer">
          <ul>
            {choice.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {state.phase === 'failed' && <p className="warning" role="alert">{state.message}</p>}
      {!busy && state.phase !== 'failed' && choice?.notice !== undefined && <p className="warning" role="alert">{choice.notice}</p>}
      {!answered && (
        <div className="actions coach-ask">
          <button type="button" className="primary" disabled={busy} onClick={ask}>
            {failed ? 'Try again' : 'Ask AI Coach'}
          </button>
        </div>
      )}
    </section>
  )
}
