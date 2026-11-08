# Zero running cost: no backend, no hosted AI

BetterAim v1 has no server. All player data stays on the player's device, and the AI Coach calls a language model with the player's own API key or a local model. The Performance Curve and Curve Peak come from a statistical model that runs on-device, so every player gets a Recommended Sensitivity even without the AI Coach (see ADR-0003). Hosting a backend or an LLM would make every player cost money, which contradicts BetterAim being free.

## Consequences

- Leaderboards, an online scenario library, scenario sharing and cloud sync are out of scope until this decision is revisited.
- Backup is via exporting and importing a local data file.
