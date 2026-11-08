# Public HTTPS page calling http://localhost (Ollama / LM Studio) from Chrome

> Research note: whether the hosted app can reach a local model server, and the Local Network Access permission it needs. Researched 2026-11-08. Confidence: high for Chrome (tested in 156); medium for Firefox and Safari (docs only).

Researched and partly tested 2026-11-08. Tested in Chrome 156.0.8078.81 (Windows, headless, own profile) against a fake local server with `Access-Control-Allow-Origin: *`, called from `https://example.com` (stand-in for `https://<user>.github.io`). Tags: H = primary doc or tested here; M = secondary source; L = unverified.

## 1. Answer

1. **Mixed content is not the blocker.** `http://localhost` and `http://127.0.0.1` are "potentially trustworthy", so a request to them from an HTTPS page is not blocked as mixed content (W3C Mixed Content 4.4; MDN: loopback is a secure origin). Tested: no mixed-content error in Chrome 156. (H)
2. **The blocker is Local Network Access (LNA).** Since Chrome 142 (Oct 2025), a request from a public site to loopback or private addresses needs a user permission. Chrome 145+ splits it: **`loopback-network`** for localhost/127.0.0.1/::1, `local-network` for LAN. Prompt text 145+: "Access other apps and services on this device" (site setting "Apps on device"); 142-144: "Look for and connect to any device on your local network" (setting "Local network access"). Edge is the same. (H, Chrome docs + Okta/Dynamsoft pages)
3. **Tested failure mode (permission not granted):** `fetch()` rejects with `TypeError: Failed to fetch`; console says "Access to fetch at 'http://localhost:11434/...' from origin 'https://example.com' has been blocked by CORS policy: Permission was denied for this request to access the `loopback` address space." The request never reaches the server. JS cannot tell this apart from "server not running" or a CORS failure, except via `navigator.permissions.query({name:'loopback-network'})` (`prompt | granted | denied`). Headless auto-denied, so I could not observe the headed prompt; Chrome docs say the first request triggers it. (H for denial, M for headed prompt timing)
4. **Tested success mode (permission granted via CDP):** plain `fetch('http://localhost:11434/v1/models')` and a `POST` with `Content-Type: application/json` + `Authorization` both worked against the CORS-enabled server, for `localhost` and `127.0.0.1`. The preflight `OPTIONS` carried `Access-Control-Request-Headers: authorization,content-type` and **no `Access-Control-Request-Private-Network`**. So **normal CORS is all the server needs; do not rely on `Access-Control-Allow-Private-Network`** (Chrome docs: PNA preflights "were never enforced as a blocking requirement and are not needed as a fallback"). (H)
5. `targetAddressSpace: 'loopback'` on the Request is accepted and harmless but unnecessary for `localhost`/IP literals (only needed when a public-looking hostname resolves to a local address). (H)
6. **Other browsers:** Firefox 153+ (released 2026-07-21 per a third-party page) enforces the same permission by default on desktop, name `loopback-network`, prompt "wants to access other apps and services on this device" (M-H, MDN BCD PR #30685 + Dynamsoft). **Safari blocks http://localhost from HTTPS pages as mixed content** (WebKit bug 171934 still open; one 2026 report says Safari 27.0.1 still blocks) so local models do not work there (M). Brave gates localhost behind its own permission (L).

## 2. What each local server needs

**Ollama** (primary source read: `envconfig/config.go`, `server/routes.go` in github.com/ollama/ollama, current main)
- Listens on `127.0.0.1:11434`. OpenAI-compatible base URL: `http://localhost:11434/v1` (H).
- Allowed origins by default: `localhost`, `127.0.0.1`, `0.0.0.0` (http and https, any port) plus `app://*`, `file://*`, `tauri://*`, `vscode-webview://*`, `vscode-file://*`. **`https://<user>.github.io` is NOT in the list**, so a request from the public site is refused until `OLLAMA_ORIGINS` includes it. `OLLAMA_ORIGINS` is comma-separated and wildcards work (`AllowWildcard = true`), but use the exact origin (no path): `https://<user>.github.io`. (H)
- Allowed request headers include `Authorization`, `Content-Type`, `Accept`, `User-Agent`, `X-Requested-With`, `OpenAI-Beta` and the `x-stainless-*` set (the OpenAI SDK's headers), so a plain `fetch` with JSON + Bearer works. (H)
- Behaviour for a disallowed origin is gin-contrib/cors default (HTTP 403, no CORS headers) which the browser reports as the same opaque `Failed to fetch`. (M, from library behaviour, not tested)
- Setting the variable, per Ollama FAQ (https://docs.ollama.com/faq): macOS app: `launchctl setenv OLLAMA_ORIGINS "https://<user>.github.io"` then quit and reopen Ollama. Linux systemd: `systemctl edit ollama.service`, add under `[Service]` `Environment="OLLAMA_ORIGINS=https://<user>.github.io"`, then `systemctl daemon-reload && systemctl restart ollama`. Windows: quit Ollama from the tray, add a user environment variable `OLLAMA_ORIGINS`, start Ollama again. (H)

**LM Studio** (primary: `lms` CLI source `src/subcommands/server.ts`, docs https://lmstudio.ai/docs/developer/core/server/settings)
- Default port **1234** (`DEFAULT_SERVER_PORT = 1234`), base URL `http://localhost:1234/v1` (M: third-party guides; the docs page I read does not state it).
- CORS is a toggle: Developer tab -> Server Settings -> **Enable CORS**; CLI `lms server start --cors`. CLI help: "Enable CORS on the server. **Allows any website you visit to access the server.**" So LM Studio's CORS is wildcard (any site can use the server while it is on). Tell users that. Off by default (M). (H for toggle, M for default)
- "Just-in-time model loading" is a separate server setting (docs); model ids come from `GET /v1/models` (L: not verified against LM Studio itself).

## 3. Copy for the AI Coach settings screen (draft)

> **Using a local model (Ollama, LM Studio)**
> 1. Start the server. Ollama: it runs on `http://localhost:11434/v1`. LM Studio: Developer tab -> Start server -> `http://localhost:1234/v1`.
> 2. Allow this website. Ollama: set `OLLAMA_ORIGINS` to `https://<user>.github.io` and restart Ollama (steps for macOS / Linux / Windows). LM Studio: switch on **Enable CORS** (this lets any website use your server while it runs).
> 3. Use Chrome, Edge or Firefox. Safari blocks this.
> 4. Press **Test connection**. Chrome asks "Access other apps and services on this device": choose **Allow**. If you blocked it earlier: lock icon -> Site settings -> **Apps on device** -> Allow (Chrome 142-144: "Local network access"), then reload.
> 5. Use `localhost` or `127.0.0.1`, not a LAN IP and not `[::1]` (see csp-connect-src.md: the CSP cannot allow those).
>
> If it still fails, check in order: server running, model name correct, origin allowed (step 2), browser permission (step 4).

Implementation hints: run **Test connection** (`GET {base}/models`) from a click so the prompt is allowed to appear; on rejection read `navigator.permissions.query({name:'loopback-network'})` inside try/catch and show the "blocked in site settings" hint only when `state === 'denied'`. **Never query `local-network-access`**: Chrome's guide says on older Chrome the query "crashes the renderer process and try/catch cannot prevent it" (it returned a state without crashing in 156).

## 4. Sources

- https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access (permission names, no PNA preflight needed, `targetAddressSpace`, secure-context requirement, feature detection)
- https://developer.chrome.com/blog/local-network-access ("The Local Network Access permission prompt is launching in Chrome 142")
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access (names, `targetAddressSpace`, "if permissions are not granted, mixed content checks still apply")
- https://help.okta.com/eu/en-us/content/topics/end-user/ov-device-lna-prompt.htm (prompt wording by Chrome version, "Apps on device")
- https://www.dynamsoft.com/web-twain/docs/faq/chromium-142-local-network-access-issue.html (permission names by version, Firefox 153, error text "Permission was denied for this request to access the `unknown` address space")
- https://www.w3.org/TR/mixed-content/ (4.4: potentially trustworthy URL not blocked), https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content
- https://bugs.webkit.org/show_bug.cgi?id=171934 (open, status NEW; WebKit wants localhost restricted first)
- https://github.com/mdn/browser-compat-data/pull/30685 (Firefox 153 `network.lna.blocking` default true)
- Ollama source and FAQ above; LM Studio `lms` source above.
- Own tests: scripts and logs in the scratchpad `csp-test` folder (`lna-test2.mjs`, `fake-ollama.mjs`).

## 5. Confidence and open doubts

- Chrome-side behaviour (H): documented and reproduced on 156. Chrome 156 is current stable-ish today (Oct 2026 release); the temporary opt-out policy `LocalNetworkAccessRestrictionsTemporaryOptOut` is scheduled for removal around 156/163 (sources disagree), so do not tell users to use enterprise opt-outs.
- Not tested: headed prompt UX (does the pending `fetch` wait for the click? docs imply yes), Firefox, Safari, Brave, real Ollama/LM Studio (CORS statements come from source code).
- Anything on a LAN IP (`http://192.168.x.x`) is out for v1: it needs the separate `local-network` permission, and our CSP (`connect-src` lists only localhost and 127.0.0.1 for http) blocks it. Chrome's docs say private IP literals and `.local` names are already exempt from mixed-content blocking once permission is granted (`targetAddressSpace` is only needed for public-looking hostnames that resolve locally), so mixed content would not be the obstacle there; the CSP and the extra permission are.
