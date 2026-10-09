---
applyTo: "**/*"
---

## What Montage is

Describe a video in one prompt and get a finished motion-graphics video back — story,
self-hosted voiceover, animated infographics, transitions — with no keyframing. Three parts:

- `Source/Engine` — the **montage-engine**: a standalone, dependency-free TypeScript
  Canvas2D render engine. Scenes are **pure functions of time**; the same `t` must always
  produce the same pixels. This is what makes preview, scrubbing and MP4 export
  identical. Never introduce hidden state, randomness without a seeded RNG, or wall-clock
  reads (`Date.now`, `performance.now`) into scene rendering.
- `Source/Montage` — the editor: a C# Arc application on Chronicle + MongoDB with a React
  frontend under `Source/Montage/.frontend`.
- `Source/Composition` — the Aspire AppHost. **`dotnet run` from `Source/Composition` is
  the way to run everything** (MongoDB replica set, Chronicle kernel, editor, Vite frontend).
