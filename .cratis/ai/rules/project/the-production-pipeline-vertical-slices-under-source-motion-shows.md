---
applyTo: "**/*"
---

## The production pipeline (vertical slices under `Source/Motion/Shows/`)

One slice per stage, each stage is an event, every stage is re-runnable:

`Creation` (the prompt) → `Planning` (LLM writes story + script + scene specs) →
`Voiceover` (per-scene TTS, concatenated) → `Timing` (word-level STT alignment + loudness
envelope) → `Packaging` (derives scene windows from word timings, writes `show.json`,
zips the package) → `Rendering` (drives the engine's headless renderer to MP4).
`Listing` is the read model the editor observes.

Rules that hold everywhere:

- **The package is the contract.** Rendering consumes only files in the package folder
  (`show.json`, `audio/voiceover.mp3`). Nothing else may leak into the engine.
- **Cuts sit in the pauses.** Scene windows are derived from word timings — a cut lands in
  the breath before a scene's first word. Never keyframe scene windows by hand.
- **Spoken ≠ on-screen.** Narration and on-screen text are separate concerns of the plan.
- **Failures are events.** A failed stage appends `ShowProductionFailed` with a readable
  error; the editor offers a per-stage retry (`RegenerateShowStage`). Never throw past a
  reactor without appending it.
