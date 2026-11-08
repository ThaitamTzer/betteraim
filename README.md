# BetterAim

A free aim trainer that runs in the browser. It finds the mouse sensitivity you aim best with and breaks down your aiming
mistakes. Everything stays on your device: no account, no server. Vocabulary is in [GLOSSARY.md](GLOSSARY.md), decisions in
[docs/adr](docs/adr).

Raw mouse input needs a Chromium-based browser (Chrome, Edge). Other browsers can still play, with a warning.

## Develop

Needs Node 24 and pnpm 10.

```
pnpm install
pnpm dev     # Vite dev server at http://localhost:5173/betteraim/
pnpm test    # Vitest
pnpm build   # type-check (app and headless core) and build into dist/
```

All game logic lives in the headless core in `src/core`; see [src/core/README.md](src/core/README.md). The rest of `src` is a
thin shell: `ui/` (React screens), `render/` (Three.js), `input/` (Pointer Lock).

## Deploy

Pushes to `main` deploy to GitHub Pages through `.github/workflows/pages.yml`. In the repository settings, Pages must be set to
source = GitHub Actions.

MIT licensed, see [LICENSE](LICENSE).
