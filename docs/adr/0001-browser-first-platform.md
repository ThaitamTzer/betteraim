# Browser-first: TypeScript + Three.js, not a native engine

BetterAim runs in the browser (TypeScript + Three.js, Pointer Lock with `unadjustedMovement` for raw mouse input) instead of a desktop engine such as Godot or Unity. A zero-install link is what lets friends test it and generate Sensitivity Finder data, static hosting is free, and the JS/TS toolchain is already in place.

## Consequences

- Raw input works in Chromium-based browsers (Chrome, Edge, Opera 88+ on Windows, macOS, ChromeOS), in Firefox 152+ (Windows, macOS) and in Safari 18.4+; others get OS-accelerated input. The Sensitivity Finder only starts where the lock was granted with raw input; elsewhere only Practice is available, with a warning. Confidence is high for Chromium and medium for Firefox and Safari: Safari shipping the option is documented but not verified, and Firefox and Safari report `movementX/Y` in other units than Chrome, so a cm/360 shown there may be scaled (each Run records its `devicePixelRatio` and user agent for a later correction). See [the research note](../research/pointer-lock-raw-input.md). (This updates the first version of this ADR, which said Chromium only.)
- Frame rate is capped at the monitor refresh rate and input latency is slightly higher than native. Tolerated because the Sensitivity Finder compares Sensitivities against each other and the added latency is identical across them.
- A Steam/desktop release would be a near-rewrite, not a port.
