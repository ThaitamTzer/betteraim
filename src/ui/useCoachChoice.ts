import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coachChoiceCache } from '../coach/choice-cache'
import { coachModelId, createCoachProvider, loadCoachSettings, missingSetup } from '../coach/settings'
import { cachedRecommendation, loadAnalysedRuns, recommendSensitivity } from '../core'
import type { FinderFit, GameProfileId, Recommendation } from '../core'
import { runStore } from '../storage/runs'
import { loadPlayerContext } from './player-context'
import { analysisCache } from './useAnalysed'

export type CoachState =
  | { phase: 'idle' }
  | { phase: 'analysing'; done: number; total: number }
  | { phase: 'asking' }
  /** The Runs could not be read or analysed. A failure of the AI Coach itself is not this: it comes back as a `choice` with a notice. */
  | { phase: 'failed'; message: string }

export interface CoachAsk {
  /** The AI Coach's answer for this data (earlier, from the cache, or just now), or the Curve Peak with a `notice` after a failure; null before anything was asked. */
  choice: Recommendation | null
  state: CoachState
  /** What the player still has to set up before the AI Coach can be asked (an API key, a model), or null when one is connected. */
  missing: string | null
  /** The AI Coach has an interval to choose within: it can be asked. */
  canAsk: boolean
  /** Asks the AI Coach once. Only ever called from a button press. */
  ask: () => void
}

const STALE = new Error('stale')
const SLICE_MS = 40

/**
 * The AI Coach's Recommended Sensitivity for a Finder fit. It only looks in the cache by itself (no request, no Analysis); `ask` is for the
 * button: it analyses the Runs the fit used in slices, with progress, so the tab does not freeze, then makes the one request. Leaving the
 * screen, or a new fit, drops an answer in flight before it can be shown (and before the request is made, if it is still analysing).
 */
export function useCoachChoice(fit: FinderFit | null, gameProfileId: GameProfileId): CoachAsk {
  const settings = useMemo(loadCoachSettings, [])
  const context = useMemo(loadPlayerContext, [])
  const missing = missingSetup(settings)
  const canAsk = fit !== null && missing === null && fit.peak !== null && fit.interval !== null
  const [choice, setChoice] = useState<Recommendation | null>(null)
  const [state, setState] = useState<CoachState>({ phase: 'idle' })
  const current = useRef(0)

  // An answer made earlier for this very data (also after a reload) is shown without asking again.
  useEffect(() => {
    current.current++
    setState({ phase: 'idle' })
    const common = { profile: gameProfileId, context, language: settings.language, model: coachModelId(settings) }
    setChoice(fit && missing === null ? cachedRecommendation({ fit, ...common, cache: coachChoiceCache() }) : null)
    return () => void current.current++
  }, [fit, gameProfileId, context, settings, missing])

  const ask = useCallback(() => {
    const provider = createCoachProvider(settings)
    if (!fit || !canAsk || !provider) return
    const mine = ++current.current
    const live = () => {
      if (mine !== current.current) throw STALE
    }
    let lastTurn = performance.now()
    void (async () => {
      try {
        setState({ phase: 'analysing', done: 0, total: fit.counts.used.length })
        const items = await loadAnalysedRuns(await runStore(), fit.counts.used, analysisCache, async (done, total) => {
          live()
          setState({ phase: 'analysing', done, total })
          if (performance.now() - lastTurn >= SLICE_MS) {
            await new Promise((resolve) => setTimeout(resolve, 0)) // a turn for the browser to paint the progress and handle input
            lastTurn = performance.now()
          }
        })
        live()
        setState({ phase: 'asking' })
        const answer = await recommendSensitivity({
          provider,
          fit,
          items,
          profile: gameProfileId,
          context,
          language: settings.language,
          model: coachModelId(settings),
          cache: coachChoiceCache(),
        })
        live()
        setChoice(answer)
        setState({ phase: 'idle' })
      } catch (error) {
        if (error === STALE) return
        setState({ phase: 'failed', message: `Your Runs could not be analysed: ${error instanceof Error ? error.message : String(error)}` })
      }
    })()
  }, [fit, canAsk, gameProfileId, context, settings])

  return { choice, state, missing, canAsk, ask }
}
