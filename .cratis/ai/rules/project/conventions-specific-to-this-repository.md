---
applyTo: "**/*"
---

## Conventions specific to this repository

- TTS/STT/language model are OpenAI-compatible self-hosted endpoints, configured under
  `Cratis:Montage` in `appsettings.local.json` (never committed). `docker/mock-services.mjs`
  serves canned responses for wiring tests without any AI services.
- The engine lives in `Source/Engine` and is built with its own npm toolchain
  (`npm run build`); the editor copies its built preview into `wwwroot/preview` at build
  time and spawns `scripts/render.ts` with node for MP4 export.
- The Chronicle client and the Chronicle kernel image are a lockstep pair pinned in
  `Directory.Packages.props` and `Source/Composition/Program.cs` — change them together.
- Release builds treat warnings as errors; Debug is lenient.
