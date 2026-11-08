import { useEffect, useRef, useState } from 'react'
import { createRun, RUN_DURATION_MS } from '../../core'
import type { Run, RunEnv, RunRecord } from '../../core'
import { captureInput, lockPointer, rawInputLikelySupported } from '../../input/pointer'
import { createScene } from '../../render/scene'
import { saveRun } from '../../storage/runs'
import type { ScreenProps } from '../routes'

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
  const timeRef = useRef<HTMLElement>(null)
  const scoreRef = useRef<HTMLElement>(null)
  const inputRef = useRef<ReturnType<typeof captureInput> | null>(null)
  const live = useRef<Live | null>(null)
  const latest = useRef({ route, go })
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
      scene = createScene(canvas, latest.current.route.params.fov, arrow)
    } catch {
      setProblem('WebGL is not available in this browser, so the 3D scene cannot be drawn.')
      return
    }
    const input = captureInput()
    inputRef.current = input
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
    const loop = () => {
      const l = live.current
      if (l) {
        for (const { at, event } of input.drain()) l.run.push({ ...event, t: at - l.origin })
        l.run.push({ kind: 'tick', t: performance.now() - l.origin })
        const state = l.run.state()
        if (timeRef.current) timeRef.current.textContent = Math.max(0, (RUN_DURATION_MS - state.t) / 1000).toFixed(1)
        if (scoreRef.current) scoreRef.current.textContent = state.score.toFixed(1)
        scene.draw(state)
        if (state.done) finish(l)
      } else {
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
      scene.dispose()
    }
  }, [])

  const start = async () => {
    const canvas = canvasRef.current
    const input = inputRef.current
    if (!canvas || !input || live.current) return
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
    input.drain()
    const env = { devicePixelRatio: window.devicePixelRatio, userAgent: navigator.userAgent, rawInput }
    live.current = { run: createRun(route.params), origin: performance.now(), id: crypto.randomUUID(), startedAt: Date.now(), env }
    setAbandoned(false)
    setPlaying(true)
  }

  const warnRaw = raw === null ? !rawInputLikelySupported() : !raw
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
      <div ref={arrowRef} className="edge-arrow" hidden />
      {playing && (
        <>
          <div className="crosshair" aria-hidden="true" />
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
            <p className="eyebrow">{name}</p>
            <h1>{abandoned ? 'Run abandoned' : 'Click to start'}</h1>
            <p>
              {abandoned
                ? 'Nothing was kept. Click to try again.'
                : 'Clicking captures your mouse and starts the 30 second timer. Press Escape to release it and abandon the Run.'}
            </p>
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
                  go({ name: 'home' })
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
