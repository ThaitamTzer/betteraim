/** Raw mouse input for the app shell. Everything here is DOM; the core only ever sees the timestamped result. */

/** Chromium exposes `pointerrawupdate`, and is the only engine with unadjusted (raw) movement. Used as an early hint. */
export const rawInputLikelySupported = (): boolean => 'onpointerrawupdate' in window

/**
 * Captures the pointer asking for unadjusted movement. Resolves to whether movement is raw: false when the
 * browser ignores or rejects the option, in which case the lock still works but the OS may accelerate it.
 * Rejects when the lock itself is refused (for example right after Escape, which Chrome blocks briefly).
 */
export async function lockPointer(element: Element): Promise<boolean> {
  const attempt: unknown = element.requestPointerLock({ unadjustedMovement: true })
  if (!(attempt instanceof Promise)) return false // older browsers return nothing and ignore the option
  try {
    await attempt
    return true
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'NotSupportedError') throw error
    await element.requestPointerLock()
    return false
  }
}

export interface QueuedInput {
  /** DOM timestamp (ms, same clock as performance.now()). */
  at: number
  event: { kind: 'move'; dx: number; dy: number } | { kind: 'down' | 'up'; button: number }
}

/**
 * Collects mouse movement and buttons while the pointer is locked. Call `drain()` once per frame and feed
 * the result to the core; it comes back sorted by time. Movement uses `pointerrawupdate` where available (so
 * every count is seen, not one sum per frame), otherwise `pointermove`; coalesced events are used when
 * present and the parent event otherwise, never both.
 */
export function captureInput() {
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
    queue.push({ at: e.timeStamp, event: { kind: e.type === 'mousedown' ? 'down' : 'up', button: e.button } })
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
