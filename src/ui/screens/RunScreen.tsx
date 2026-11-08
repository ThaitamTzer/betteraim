import { useEffect, useRef, useState } from 'react'
import { angleBetween, createRun, getScenario, RUN_DURATION_MS } from '../../core'
import type { Run, RunEnv, RunRecord } from '../../core'
import { createHitSound, targetGone } from '../../audio/hit-sound'
import { captureInput, lockPointer, rawInputLikelySupported } from '../../input/pointer'
import { createScene } from '../../render/scene'
import { saveRun } from '../../storage/runs'
import { Crosshair } from '../Crosshair'
import { loadPreferences } from '../preferences'
import type { ScreenProps } from '../routes'
import { formatScore, trackingRule } from '../score'

interface Live {
  run: Run
  /** performance.now() when the Run started; core time is DOM time minus this. */
  origin: number
  id: string
  startedAt: number
  env: RunEnv
}

export function RunScreen({ route, go }: ScreenProps<'run'>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const onTargetRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLElement>(null)
  const scoreRef = useRef<HTMLElement>(null)
  const inputRef = useRef<ReturnType<typeof captureInput> | null>(null)
  const live = useRef<Live | null>(null)
  const latest = useRef({ route, go })
  const [prefs] = useState(loadPreferences) // read once per screen: Options changes apply from the next Run
  const [sound] = useState(createHitSound)
  const [playing, setPlaying] = useState(false)
  const [abandoned, setAbandoned] = useState(false)
  const [raw, setRaw] = useState<boolean | null>(null) // null until the pointer was captured once
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    latest.current = { route, go }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const arrow = arrowRef.current
    if (!canvas || !arrow) return
    let scene: ReturnType<typeof createScene>
    try {
      scene = createScene(canvas, latest.current.route.params.fov, arrow, prefs.targetColor)
    } catch {
      setProblem('WebGL is not available in this browser, so the 3D scene cannot be drawn.')
      return
    }
    const input = captureInput(prefs.fireButton)
    inputRef.current = input
    const { scenario } = latest.current.route.params
    const tracking = getScenario(scenario).category === 'tracking'
    const idle = createRun(latest.current.route.params).state()

    const finish = (l: Live) => {
      live.current = null
      document.exitPointerLock()
      const { route: r, go: navigate } = latest.current
      const record: RunRecord = { ...r.params, ...r.meta, id: l.id, startedAt: l.startedAt, env: l.env, ...l.run.result() }
      saveRun(record)
      navigate(r.next(record))
    }

    let frame = 0
    let aliveBefore: number[] = []
    const loop = () => {
      const l = live.current
      if (l) {
        for (const { at, event } of input.drain()) l.run.push({ ...event, t: at - l.origin })
        l.run.push({ kind: 'tick', t: performance.now() - l.origin })
        const state = l.run.state()
        if (prefs.hitSound.on && targetGone(aliveBefore, state.targets)) sound.play(prefs.hitSound.volume)
        aliveBefore = state.targets.map((t) => t.id)
        if (timeRef.current) timeRef.current.textContent = Math.max(0, (RUN_DURATION_MS - state.t) / 1000).toFixed(1)
        if (scoreRef.current) scoreRef.current.textContent = formatScore(scenario, state.score)
        // Tracking is about staying on target, so a ring shows while the crosshair is on one (fire still has to be held to score).
        if (onTargetRef.current) {
          onTargetRef.current.hidden = !(tracking && state.targets.some((t) => angleBetween(state.crosshair, t) <= t.radius))
        }
        scene.draw(state)
        if (state.done) finish(l)
      } else {
        aliveBefore = [] // a restarted Run must not beep for the abandoned one's targets
        input.drain()
        scene.draw(idle)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    // Escape (or anything else that frees the pointer) abandons the Run: nothing is recorded.
    const onLockChange = () => {
      if (document.pointerLockElement === canvas || !live.current) return
      live.current = null
      const { route: r, go: navigate } = latest.current
      if (r.session) return navigate(r.session.onAbandon) // a Finder Run: Resume or Quit Session
      setPlaying(false)
      setAbandoned(true)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerlockchange', onLockChange)
      live.current = null
      if (document.pointerLockElement) document.exitPointerLock()
      input.stop()
      inputRef.current = null
      sound.close()
      scene.dispose()
    }
  }, [prefs, sound])

  const start = async () => {
    const canvas = canvasRef.current
    const input = inputRef.current
    if (!canvas || !input || live.current) return
    sound.prime() // needs this click's user gesture
    setProblem(null)
    let rawInput: boolean
    try {
      rawInput = await lockPointer(canvas)
      setRaw(rawInput)
    } catch {
      setProblem('The mouse could not be captured. Click again to retry.')
      return
    }
    if (document.pointerLockElement !== canvas) {
      setProblem('The mouse could not be captured. Click again to retry.')
      return
    }
    if (!rawInput && route.session) {
      // Never record an accelerated Run as a Finder Run.
      document.exitPointerLock()
      go(route.session.onNotRaw)
      return
    }
    input.drain()
    const env = { devicePixelRatio: window.devicePixelRatio, userAgent: navigator.userAgent, rawInput }
    live.current = { run: createRun(route.params), origin: performance.now(), id: crypto.randomUUID(), startedAt: Date.now(), env }
    setAbandoned(false)
    setPlaying(true)
  }

  // The player's click on the screen before this one gives the activation, so a Finder Run starts at once. The card stays as
  // the fallback when the lock is refused. A timer, not a bare call: Strict Mode runs the effects twice in development.
  useEffect(() => {
    if (!route.session) return
    const timer = setTimeout(() => void start(), 0)
    return () => clearTimeout(timer)
  }, [])

  // A Finder Run never plays without raw input, so the Practice warning (which says you can still play) does not apply.
  const warnRaw = !route.session && (raw === null ? !rawInputLikelySupported() : !raw)
  const warning = (
    <p className="warning" role="status">
      Raw mouse input is not available in this browser, so the OS may accelerate your mouse and distort results. Use
      Chrome, Edge or another Chromium browser for accurate Sensitivity. You can still play.
    </p>
  )
  const name = route.params.scenario.charAt(0).toUpperCase() + route.params.scenario.slice(1)

  return (
    <div className="stage" onClick={playing ? undefined : start}>
      <canvas ref={canvasRef} className="viewport" />
      <div ref={arrowRef} className="edge-arrow" style={{ borderLeftColor: prefs.targetColor }} hidden />
      {playing && (
        <>
          <Crosshair crosshair={prefs.crosshair} />
          <div ref={onTargetRef} className="on-target-ring" aria-hidden="true" hidden />
          <div className="hud">
            <span>
              Time <b ref={timeRef}>30.0</b>
            </span>
            <span>
              Score <b ref={scoreRef}>0.0</b>
            </span>
          </div>
          {warnRaw && <div className="hud-warning">{warning}</div>}
        </>
      )}
      {!playing && (
        <div className="overlay">
          <div className="card">
            <p className="eyebrow">{route.session ? `${route.session.label} · ${name}` : name}</p>
            <h1>{abandoned ? 'Run abandoned' : 'Click to start'}</h1>
            <p>
              {abandoned
                ? 'Nothing was kept. Click to try again.'
                : 'Clicking captures your mouse and starts the 30 second timer. Press Escape to release it and abandon the Run.'}
            </p>
            {trackingRule[route.params.scenario] && <p>{trackingRule[route.params.scenario]}</p>}
            {warnRaw && warning}
            {problem && <p className="warning" role="alert">{problem}</p>}
            <div className="actions">
              <button type="button" className="primary" autoFocus>
                {abandoned ? 'Try again' : 'Start'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  go(route.session ? route.session.onAbandon : { name: 'home' })
                }}
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
