# BetterAim

A free aim trainer that runs in the browser. It finds the mouse sensitivity you aim best with and breaks down your aiming
mistakes. Everything stays on your device: no account, no server. Vocabulary is in [GLOSSARY.md](GLOSSARY.md), decisions in
[docs/adr](docs/adr).

Raw mouse input works in Chromium-based browsers (Chrome, Edge, Opera), Firefox 152+ and Safari 18.4+; Chromium is the verified path, and in Firefox and Safari the shown cm/360 may be scaled
(see [docs/research](docs/research/pointer-lock-raw-input.md)). Other browsers can still play Practice, with a warning.

## Develop

Needs Node 24 and pnpm 10.

```
pnpm install
pnpm dev     # Vite dev server at http://localhost:5173/betteraim/
pnpm test    # Vitest
pnpm build   # type-check (app and headless core) and build into dist/
```

All game logic lives in the headless core in `src/core`; see [src/core/README.md](src/core/README.md). The rest of `src` is a
thin shell: `ui/` (React screens), `render/` (Three.js), `input/` (Pointer Lock), `coach/` (AI Coach provider adapters and settings), `storage/` (IndexedDB Run store) and `audio/` (hit sound).
Research behind the decisions is in [docs/research](docs/research).

## Deploy

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`. In the repository settings, Pages must be set to
source = GitHub Actions.

The production build carries a Content Security Policy as a meta tag (`src/csp.ts`, injected by `vite.config.ts`; the dev server has none). It lets
scripts come from the app only and lets the AI Coach call https addresses and `http://localhost` / `127.0.0.1`. If you add a library that injects
`<style>` tags or loads from a CDN, the build will break at runtime in a browser: check the console for CSP violations.

MIT licensed, see [LICENSE](LICENSE).
