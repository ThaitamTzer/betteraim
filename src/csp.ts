/**
 * The Content Security Policy of the production build, injected as a meta tag by vite.config.ts (GitHub Pages cannot send
 * headers; the dev server needs inline scripts for hot reload, so it gets none). Tested in Chrome against the real build:
 * Three.js, uPlot, React inline styles and Web Audio need nothing beyond this. Research: docs/research/csp-connect-src.md and
 * docs/research/chrome-localhost.md (why a hosted page can still reach a local model).
 *
 * - Scripts: only the app's own files. No `unsafe-inline`, no `unsafe-eval`, so injected scripts, inline handlers and `eval` are blocked.
 * - `connect-src` is what the AI Coach fetches: any https address (the player picks the provider), and http only to localhost and
 *   127.0.0.1 (Ollama, LM Studio). Chrome cannot express IPv6 literals in a policy, so `[::1]` is not allowed. `data:` and `blob:`
 *   stay because `fetch` of a data or blob URL is checked against `connect-src`.
 * - What a static policy cannot do, because `connect-src` has to allow any https host: stop code that runs from the app's own
 *   bundle from sending the key to an https address, or stop navigation. The Options screen says so.
 * - A meta policy cannot carry `frame-ancestors`, `report-uri` or `sandbox`.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data: https: http://localhost:* http://127.0.0.1:*",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')
