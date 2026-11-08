# Browser-first: TypeScript + Three.js, not a native engine

BetterAim runs in the browser (TypeScript + Three.js, Pointer Lock with `unadjustedMovement` for raw mouse input) instead of a desktop engine such as Godot or Unity. A zero-install link is what lets friends test it and generate Sensitivity Finder data, static hosting is free, and the JS/TS toolchain is already in place.

## Consequences

- Raw input only works in Chromium-based browsers; others get OS-accelerated input.
- Frame rate is capped at the monitor refresh rate and input latency is slightly higher than native. Tolerated because the Sensitivity Finder compares Sensitivities against each other and the added latency is identical across them.
- A Steam/desktop release would be a near-rewrite, not a port.
