# Pointer Lock with raw input (`unadjustedMovement`) and capturing every count

> Research note: which browsers give raw mouse input and how to capture every count. Researched 2026-11-08. Confidence: high for the API contract and Chromium; medium-low for Safari 18.4 shipping the option and for `movementX/Y` units in Firefox and Safari (never run on a real mouse there).

Researched and partly tested 2026-11-08 (Chrome 156.0.8078.81, Windows, headless, own profile). Tags: H = spec/MDN/BCD or tested; M = secondary; L = weak or inferred.

## 1. Answer

**Support (MDN browser-compat-data, read from GitHub):**

| Browser | `unadjustedMovement` option | Promise return | Notes |
|---|---|---|---|
| Chrome / Edge / Opera | 88+ | 92+ | Windows, macOS 10.15.1+, ChromeOS. **Not Linux** (BCD: "Not yet supported on Linux"; re-check) |
| Firefox | **152+** (released 2026-06-16) | **unknown** (BCD has no Promise note; MDN's Firefox 152 notes only say the method "now supports the `options.unadjustedMovement` parameter") | Windows + macOS (M); Linux and Android reject with `NotSupportedError` (Mozilla intent-to-ship + bug 2037802) |
| Safari | **18.4+** per BCD (L-M: WebKit commit Mar 2024, bug 218054, I found no release note) | 18.4+ | treat as "try and see" |

Older versions ignore the unknown dictionary member and lock WITH OS acceleration, with no signal, and a return-type check cannot catch an engine that returns a Promise but does not know the member. So detect "did the engine read the option" instead.

**Detection (there is no sync flag): probe with a getter.** WebIDL reads only the dictionary members the engine knows, synchronously at call time. Tested in Chrome 156: the getter fires on the call even though the lock then fails (`WrongDocumentError`, headless); an unknown member is never read; a method that takes no argument never reads its argument (control: `document.exitPointerLock(opts)`). Not run on Firefox/Safari (not installed here); that part follows from WebIDL, not from a test.
```js
// must run inside a click/keydown handler (transient activation)
async function lockRaw(el) {
  let recognized = false;
  const ret = el.requestPointerLock({ get unadjustedMovement() { recognized = true; return true; } });
  // Engine never read the option: any lock it grants is ACCELERATED. Keep it for Practice (with the
  // spec's warning), block the Finder. Do not exit, the request may still be pending.
  if (!recognized) return 'accelerated';
  try {
    if (ret instanceof Promise) await ret;                       // Chrome 92+, Safari 18.4+, Firefox maybe
    else await new Promise((ok, no) => {                         // returns-undefined variant: events only
      const done = (f) => () => { document.removeEventListener('pointerlockchange', a); document.removeEventListener('pointerlockerror', b); f(); };
      const a = done(ok), b = done(() => no(new DOMException('', 'UnknownError')));
      document.addEventListener('pointerlockchange', a); document.addEventListener('pointerlockerror', b);
    });
    return 'raw';
  } catch (e) {
    if (e.name === 'NotSupportedError') return 'unsupported';    // recognized but platform cannot do raw input
    return 'retry:' + e.name;   // NotAllowedError / SecurityError / WrongDocumentError / InvalidStateError: transient
  }
}
```
Fail-closed rule: the Finder starts only on `'raw'`. `'accelerated'` and `'unsupported'` mean Practice-only with the warning (for `'unsupported'` retry once with plain `requestPointerLock()` to get the lock). `'retry:*'` is transient (ask for another click); on the events-only path an `UnknownError` has no name to inspect, so also treat it as transient and let the second attempt decide.
- Spec algorithm (https://w3c.github.io/pointerlock/): `NotAllowedError` no transient activation; `WrongDocumentError` document not focused (I hit this in headless: "The root document of this element is not valid for pointer lock."); `SecurityError` sandboxed iframe; `NotSupportedError` when `unadjustedMovement` is true and the platform does not support it, **and also for any generic platform lock failure**; `InvalidStateError` another lock. Every failure also fires `pointerlockerror` on the document, so attach a listener or you get noise; the promise rejection must be caught.
- To confirm "raw is the missing piece": if the raw request rejects `NotSupportedError`, immediately retry `requestPointerLock()` without the option (still inside the same activation). Success there proves the lock itself works, so tag the session `rawInput:false`, block the Finder, allow Practice with the warning (spec stories 7, 8).
- **No getter exists for "is this lock unadjusted".** Persist the detection result per page session, not per browser version.
- `requestPointerLock()` returns a Promise in Chrome 92+ (BCD; consistent with my 156 test, where the failure surfaced as a rejection with the spec's error name). `await` on a non-Promise is harmless, but you need the `instanceof Promise` check to catch old browsers.
- Permission: Chrome 131 announced a permission prompt for pointer/keyboard lock, but **Chrome later decided NOT to launch it** (banner on the Chrome blog post, updated 2026-03-17: "We have decided not to launch the Keyboard Lock and Pointer Lock permissions"). Tested: `navigator.permissions.query({name:'pointer-lock'})` returns `granted` in Chrome 156 with no prompt. Do not build UI for it. (H)
- Requirements: transient user activation (click or non-Esc keydown); call `requestPointerLock()` BEFORE `requestFullscreen()` (fullscreen consumes the activation); sandboxed iframes need `allow-pointer-lock`.

**Capturing every count:**
- `pointerrawupdate`: Chrome/Edge 77+ (secure context only since 142), Firefox 148+ (Firefox 140-147 delivered `movementX/Y` always 0, bug 1987671, so do not use it there), **Safari: no**. Tested in Chrome 156: `pointerrawupdate` events carry `movementX/Y` and fire just before the matching `pointermove` with the same values. Listen on `document` (events target the locked element and bubble).
- `PointerEvent.getCoalescedEvents()`: Chrome 58, Firefox 59, Safari 18.2. `pointermove` is frame-aligned, so counts between frames are merged unless you read the coalesced list.
- Recommended capture: `'onpointerrawupdate' in window` and not (Firefox < 148) -> use **only** `pointerrawupdate` (one handler, sum nothing extra). Otherwise `pointermove` and iterate `e.getCoalescedEvents()` (fall back to `[e]` if empty) summing each event's `movementX/Y` with its own `timeStamp`. **Never mix streams or add `e.movementX` on top of the coalesced list** (double count). Whether a `pointermove`'s own `movementX` equals the sum over its coalesced events is spec-implied (spec only requires movement to sum to the `screenX/Y` change) but I could not verify it with a real 1000 Hz mouse (L). Put a manual check on the release checklist: move fast, compare Sum(raw) with Sum(pointermove).
- Fallback if neither: `mousemove` (Practice only).

**`movementX/Y` caveats (important for cm/360 correctness):**
- Spec type is `double`, not integer. In my synthetic test Chrome returned integers (50, 10, -2), but those came from CDP moves, not raw HID counts. Do not assume integers: store as Float32/Int32 pairs unless a measurement shows every sample is integral, then pack to Int16.
- **The unit differs per browser** (w3c/pointerlock#42, open since 2019, still receiving "please fix" comments in Aug 2025): table in the issue: Chrome/Edge = physical pixels, not scaled by display scale factor, not by page zoom; **Firefox = CSS pixels, scaled by display scale factor and page zoom**; Safari = DIP (buggy?). Table is old; a 2024 comment still shows Chrome mismatching clientX on a DPR 2 Mac. With `unadjustedMovement` on Chrome/Windows the value should be raw counts (inference, L). On Firefox/Safari the same mouse may deliver counts scaled by DPR/zoom, which would shift the absolute cm/360 and Game Sensitivity output by that factor (the curve shape would be fine). Recommendations: (a) save `devicePixelRatio`, `navigator.userAgent` and the lock mode in every Run record so old Runs can be corrected later; (b) tell users to keep browser zoom at 100 %; (c) decide whether v1 Finder is Chromium-only until Firefox/Safari raw units are verified on a real mouse.
- Spec: movement is 0 after any gap in input (cursor leaving the window); lock exits when the window/tab loses focus.

**Escape, user gesture, re-lock cooldown:**
- Esc (the browser's default unlock gesture) always exits; Chromium consumes the key before the page sees it, so detect via `pointerlockchange` with `document.pointerLockElement === null`, never via `keydown`. Also fires on blur, tab switch, element removal.
- **Chrome refuses a new request for 1250 ms after a user Esc** (`kEffectiveUserEscapeDuration = base::Milliseconds(1250)` in Chromium's `PointerLockController`; I did not reproduce it headless). It rejects with `SecurityError` ("Pointer lock cannot be acquired immediately after the user has exited the lock"). A later Blink rate limit also throws `NotAllowedError` "Too many pointer lock requests in a short window of time". (M: one blog analysis of the Chromium source plus a practitioner note.)
- Per spec, a page-initiated `document.exitPointerLock()` exempts the next request from the activation requirement and does not arm the cooldown (M; a practitioner probe says Chrome 154 honours it, Firefox 150 does not).
- UX that works: on Esc show a Paused overlay ("Click to resume"); the click gives fresh activation; if the request rejects with `SecurityError`, retry once after ~1300 ms while the activation (about 5 s in Chrome) is still live; never auto-relock without a click.

## 2. Sources

- https://w3c.github.io/pointerlock/ (algorithm and error names, movementX/Y definition), https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock (transient activation, re-lock after user exit fails even with activation, fullscreen order).
- MDN BCD JSON for `Element.requestPointerLock`, `options_unadjustedMovement_parameter`, `PointerEvent.getCoalescedEvents`, `Element.pointerrawupdate_event` (read via `gh api repos/mdn/browser-compat-data/contents/api/*.json`).
- https://web.dev/articles/disable-mouse-acceleration (detection pattern: no promise -> unsupported, `NotSupportedError` fallback; ChromeOS, macOS Catalina 10.15.1, Windows).
- https://developer.chrome.com/blog/keyboard-lock-pointer-lock-permission (banner: not launching).
- https://bugzilla.mozilla.org/show_bug.cgi?id=2037802 (Firefox ship bug, Android throws `NotSupportedError`), https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152.
- https://github.com/w3c/pointerlock/issues/42 (movementX/Y coordinate space table and comments).
- https://csarko.sh/research/pointer-lock-escape-cooldown (1250 ms constant, error text, programmatic exit exemption); https://issues.chromium.org/issues/40148473 (requires sign-in, content not readable).
- Test page and script: scratchpad `csp-test/dist/pl.html`, `pl-test.mjs`.

## 3. Confidence and open doubts

- H: promise/`NotSupportedError` contract, support table, `pointerrawupdate` availability, no Chrome permission prompt.
- M-L: Safari 18.4 actually shipping the option; Firefox on macOS vs Windows parity; the exact movement unit with `unadjustedMovement` on each OS. **Raw-input behaviour could not be tested here: headless Chrome returns `WrongDocumentError`, and I did not open a headed window on the user's desktop.** The release checklist must include a real-mouse test per browser (compare the counts for a measured physical movement).
- Linux Chrome: BCD says unsupported, so Linux users fall into "Practice only".
