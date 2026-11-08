/** Raw mouse input for the app shell. Everything here is DOM; the core only ever sees the timestamped result. */

/** Chromium and Firefox 148+ expose `pointerrawupdate`; Safari does not but may still give raw movement. Only an early hint. */
export const rawInputLikelySupported = (): boolean => 'onpointerrawupdate' in window

/** Settles with the next pointer lock outcome: resolves on `pointerlockchange`, rejects on `pointerlockerror`. */
const lockEvent = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const done = (settle: () => void) => () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('pointerlockerror', onError)
      settle()
    }
    const onChange = done(resolve)
    const onError = done(() => reject(new DOMException('The pointer lock was refused.', 'UnknownError')))
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('pointerlockerror', onError)
  })

/**
 * Captures the pointer asking for unadjusted movement. Resolves to whether movement is raw: false when the
 * browser ignores or rejects the option, in which case the lock still works but the OS may accelerate it.
 * Rejects when the lock itself is refused (for example right after Escape, which Chrome blocks briefly).
 * This is the real capability check; `rawInputLikelySupported` is only an early hint for the UI.
 */
export async function lockPointer(element: Element): Promise<boolean> {
  // Browsers read only the dictionary members they know, so the getter runs only where the option is supported.
  let optionRead = false
  const options = {
    get unadjustedMovement() {
      optionRead = true
      return true
    },
  }
  const attempt: unknown = element.requestPointerLock(options)
  try {
    // An engine that returns nothing still grants (or refuses) the lock by event, and may well have read the option.
    await (attempt instanceof Promise ? attempt : lockEvent())
    return optionRead
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotSupportedError') throw error
    await element.requestPointerLock()
    return false
  }
}

/** The core fires on button 0 whatever the player bound: swapping the two keeps the Run record canonical. */
export const canonicalButton = (button: number, fire: number): number => (button === fire ? 0 : button === 0 ? fire : button)

export interface QueuedInput {
  /** DOM timestamp (ms, same clock as performance.now()). */
  at: number
  event: { kind: 'move'; dx: number; dy: number } | { kind: 'down' | 'up'; button: number }
}

/**
 * Collects mouse movement and buttons while the pointer is locked. Call `drain()` once per frame and feed
 * the result to the core; it comes back sorted by time. Movement uses `pointerrawupdate` where available (so
 * every count is seen, not one sum per frame), otherwise `pointermove`; coalesced events are used when
 * present and the parent event otherwise, never both. `fireButton` is the physical button the player bound to fire.
 */
export function captureInput(fireButton = 0) {
  let queue: QueuedInput[] = []
  const locked = () => document.pointerLockElement !== null

  const onMove = (e: PointerEvent) => {
    if (!locked()) return
    const coalesced = e.getCoalescedEvents?.() ?? []
    for (const part of coalesced.length > 0 ? coalesced : [e]) {
      if (part.movementX !== 0 || part.movementY !== 0) {
        queue.push({ at: part.timeStamp, event: { kind: 'move', dx: part.movementX, dy: part.movementY } })
      }
    }
  }
  // mouse events, not pointer events: pointerdown does not fire for a second button held while another is down
  const onButton = (e: MouseEvent) => {
    if (!locked()) return
    e.preventDefault()
    queue.push({ at: e.timeStamp, event: { kind: e.type === 'mousedown' ? 'down' : 'up', button: canonicalButton(e.button, fireButton) } })
  }
  const noMenu = (e: Event) => e.preventDefault()

  const moveType = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove'
  document.addEventListener(moveType, onMove as EventListener)
  document.addEventListener('mousedown', onButton)
  document.addEventListener('mouseup', onButton)
  document.addEventListener('contextmenu', noMenu)

  return {
    drain(): QueuedInput[] {
      const out = queue.sort((a, b) => a.at - b.at)
      queue = []
      return out
    },
    stop() {
      document.removeEventListener(moveType, onMove as EventListener)
      document.removeEventListener('mousedown', onButton)
      document.removeEventListener('mouseup', onButton)
      document.removeEventListener('contextmenu', noMenu)
    },
  }
}
