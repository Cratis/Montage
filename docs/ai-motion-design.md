# Motion: a motion-design tool, not a narration template

## What the references actually ask for

The [Screenplay article](https://blog.cratis.io/screenplay-the-assembly-language-of-the-business/) contains **relationship infographics**, not just quantitative charts:

- **Every platform has its IL**: three parallel rows, a platform label, producer languages, an intermediate representation and a runtime. Business is a highlighted analogy, not another stage in a linear pipeline.
- **One language in the middle**: five producers converge on Screenplay; four consumers branch out. Routing, hierarchy and grouping communicate the idea.
- **One board, many hosts**: a central shared board fans out to six tools above and below it.
- Product screenshots and animated comparisons are different material. A screenshot can be panned or zoomed; its internal boxes are not independent objects unless reconstructed.

The [Getting started article](https://blog.cratis.io/getting-started-with-cratis/) additionally supplies lifecycle maps, numbered paths, commands and systems diagrams. Preserve those relationships and factual labels. Do not invent numerical data to force them into charts.

### Why SVG

SVG is a good vector intermediate representation: boxes, text, paths, groups, transforms, clips and IDs remain editable. An SVG loaded as an HTML image is **flattened for our purposes**. Panning it does not animate its internals.

Motion should keep a semantic scene graph, compile it to SVG geometry and evaluate each object's properties against absolute video time. Outline length, dash offset, fill opacity, label reveal, connector endpoints and pen-tip position are separate channels. Browser wall-clock CSS/SMIL animations must not control an offline render. Rendering at time `t` twice, or seeking backwards, must produce the same pixels.

### Craft, not random motion

Motion design uses graphic design over time to explain relationships and direct attention. Relevant principles:

- **Staging / hierarchy**: one focal idea per beat; scale, contrast, placement and whitespace establish priority.
- **Anticipation**: signal an upcoming change without delaying comprehension.
- **Timing / rhythm**: explicit build beats, easing, accent beats and holds. Narration, music and the visual composition are related clocks, not interchangeable.
- **Secondary motion**: pen glows, settling and traces support the main reveal; they must not compete with labels or data.
- **Continuity**: stable layouts and anchors; do not recenter an entire composition when another label arrives.
- **Art direction**: moodboard → style frames → animatic → animation → visual QA. A text completion is not the whole production harness.

The original `Motion_as_kit` is materially richer than the initial Motion presets. Its `_vo.ts`, `_motifs.ts`, `pipeline.ts` and WebGL engine provide a timed plotter/pen, keyframed 2D camera, stroke typography, spark trails, particles, bloom/compositing and adaptive motion-blur sampling. Preserve these as future capabilities, not as evidence that they already exist in the current canvas engine.

## Implemented in this iteration

### Structured infographics

`diagram` scenes have stable node IDs, explicit boxes, routed connectors and object-level build timing. The geometry is expressed with SVG paths and painted by the deterministic canvas compositor. Supported reveals: outline trace, glowing drafting pen, masked wipe, pop, slide and fade; fill and label settle after the outline. Connectors draw independently and finish with arrowheads. Optional explicit connector points permit custom routing. SVG downloads retain structure and build metadata; the download is a static editable illustration, not a standalone animated player.

The **Assembly Language of the Business** seeded show now uses the actual three blog structures: parallel platform rows, the Screenplay convergence hub and board fan-out. It is no longer represented by a misleading linear flow and a moving mock screenshot.

### AI-assisted design and reusable diagram styles

The infographic inspector's **Design** tab can:

- Generate a layout and choreography with the configured LLM, rather than only storing a motion note.
- Paste or upload reference images; providers must support image input. GIFs are accepted as visual references, **not temporally analysed motion examples**.
- Ask for a fresh draft after diagram edits (debounced). Opening the tab does not generate anything.
- Review/apply/discard a draft; no production plan is overwritten by an unreviewed response.
- Save generated colour/radius/pen tokens and motion rules as a named reusable diagram template in the workspace. Apply it without replacing the diagram's content.
- Add/remove boxes and connectors; edit labels, geometry, per-node beats and reveal effects directly.

Model replies are structured data, not arbitrary executable code. Bounds, IDs and edge references are checked. Requests time out visibly. A stale response cannot overwrite newer edits. Saving the storyboard is still required to refresh the packaged preview/video.

**Scope:** these are reusable *diagram* design templates. They are not yet a global look-and-feel system for every scene, typography and logos. The generic image-direction field from the preceding iteration is stored but is not itself a model regeneration pipeline.

### Export consistency fixes

- Transition compositing was discarded by a subsequent canvas clear/incoming-frame paint. It now survives into the final HUD/post pass.
- Transition easing was applied twice; it is now evaluated once.
- Gaps between timeline windows incorrectly selected the final scene (flashing the endcard). Gaps now hold the preceding scene.
- Explicit font-weight loading precedes measurements and capture, preventing mid-render fallback-font swaps.
- Kinetic word pops now decay instead of snapping from an enlarged state at word end. Short lyric plates keep a stable layout.
- Frame streaming acknowledges encoder backpressure, validates RGBA payload sizes, rejects early disconnects and checks the encoder's exit code.
- Browser regression verifies transition pixels, SVG build progression, reverse-seek determinism and sequential/direct-time agreement. Real MP4 inspection remains necessary for every renderer change.

### Verification / live blockers

Release builds with zero warnings/errors; frontend type-check/build and browser motion regressions pass. A real three-second export has exactly 180 frames at 60 fps; decode found 180 distinct frame hashes. An intentionally invalid encoder preset fails promptly instead of leaving a hanging renderer. Assembly contact sheets demonstrate actual partial outlines, staged row builds and final hub/fan-out layouts.

The live reference-guided AI request reached the selected configured Claude provider, but the provider returned `invalid x-api-key`. The endpoint reports that failure without changing the slide. A successful live generation is **not yet verified**; credentials need correction in Settings. Template storage and manual SVG choreography do not require that provider to work.

## Full requirements ledger — do not lose these again

| Requirement | Current status / next work |
|---|---|
| AI-driven motion design, beyond prompt → fixed scene presets | Diagram drafts now generate geometry + choreography. General generated scenes and a visual critique loop remain next. |
| Templates created through prompts and visual examples | Implemented for diagram tokens + motion rules. Extend to typography, grids, aspect ratios, backgrounds, transitions and the whole show. |
| Paste images into a creative brief | Supported as diagram reference input. Extend to the show brief and template library. |
| GIFs/videos as **motion** examples | Temporal extraction is not implemented. Sample frames with timestamps, infer motion/easing, keep the reference's provenance; never claim a single frame captures the motion. |
| Logos library | Still required: durable reusable brand assets, multiple logo variants, SVG/raster support and safe-area metadata. Current fixed Cratis HUD is not a logo library. |
| Define logo location and all-slides/per-slide visibility | Still required: brand-kit placement/scale/margins and a slide-level inherit/show/hide checkbox. Honor settings identically in preview and render. |
| Images on **any** slide, per-image instructions | Dedicated image scene exists. Extend to composable layers on every scene and genuinely generate per-image motion from the instructions. Current image presets are not arbitrary AI choreography. |
| Regenerate slide motion after **any** edit with AI involved | Diagram edits can request new drafts. All-scene revision tracking, changed-layer dependency detection and production jobs are still required; don't re-synthesize every voice for a visual-only edit. |
| Arbitrary, expressive diagrams and effects | Current node/link model is a foundation. Next: groups/swimlanes, icons, custom paths, connector labels, masks, gradients, path morphs, camera choreography, sketch strokes and motion blur. |
| New demos showcasing capabilities | Assembly is the acceptance demo for relationship graphics. Test structural fidelity, not merely whether a render completed. |
| Smooth finished videos | Compositor and kinetic discontinuities fixed. Keep pixel-level and MP4 cadence QA; clustered STT timings and long-text layout transitions remain potential causes. |
| Original kit's expressive motion capabilities | Port reusable camera/plotter/stroke/particle primitives; evaluate a WebGL renderer where compositing or blur warrants it. Keep deterministic time. |

## Architecture beyond this iteration

1. **Brief + reference library**: uploads with metadata, rights/provenance, selected stills and sampled motion examples.
2. **Brand / design templates**: versioned palettes, typography, grid, component grammar, easing vocabulary, reveal rules and logo behaviour. Store both the instructions and the resolved tokens.
3. **Art director**: propose style frames and alternatives before animating. Review references alongside the actual rendered proposal.
4. **Scene author**: generate a semantic layered graph or a sandboxed scene module when the graph is insufficient. Do not constrain the creative model forever to today's twelve scene classes.
5. **Choreographer**: produce property tracks, cue dependencies, camera moves and audio/beat anchors. Separate content, geometry and animation tracks.
6. **Compiler / validator**: typed schemas; measured text and shape bounds; ID/link validation; overlap checks; safe assets; no untrusted script/network access. Generated modules need resource limits and isolation, not `eval` inside the editor.
7. **Renderer + critic loop**: render keyframes/contact sheets and short clips; a vision model critiques layout, factual fidelity, continuity and timing; revise with a bounded loop. Preserve successful versions and allow rollback.
8. **Incremental production**: every edit creates a revision. Regenerate affected layers only; visual changes should not discard manual word timing or record unchanged narration again. Thin reactor → durable job, bounded model calls, visible failure and version-aware result application.

### Acceptance checks for the Assembly demo

- The three-row IL diagram matches the supplied reference's relationships and emphasis.
- Boxes visibly trace before fills and labels appear; arrows draw between the correct boxes.
- The convergence hub and fan-out map are actual editable graphs, not one panned SVG image.
- Templates change appearance and motion vocabulary without changing labels or relationships.
- Model drafts use the selected provider and references; failed/stale drafts leave the original slide untouched.
- Random seeks match sequential rendering; fonts and assets are loaded before frame zero.
- MP4 frame count/cadence are correct and active builds progress without unexpected repeated frames.

## Research sources and limitations

- [SVG path lengths / geometry](https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getTotalLength), [stroke-dashoffset](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dashoffset), [SVG 2 paths](https://www.w3.org/TR/SVG/paths.html).
- [Seekable Web Animations currentTime](https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime): if we use WAAPI, pause it and set time explicitly rather than relying on autoplay.
- [Disney animation](https://www.disneyanimation.com/process/animation/), [layout / staging](https://www.disneyanimation.com/process/layout/), [visual hierarchy](https://www.mcgill.ca/web-services/resources/toolkits/digital-design-toolkit/design-principles/visual-hierarchy).
- [Motion-development process: boards, style frames, animatics](https://www.simonrankin.com/learn/2020/07/28/the-motion-design-development-process-thumbnails-storyboards-style-boards-and-animatics).
- [Remotion motion-graphics agent workflow](https://github.com/Liamrjohnston/remotion-motion-graphics-skill), [AI-coded motion-reference examples](https://oneshotted.io/): useful directions for modular generation and reference/critique workflows, not a requirement to replace our renderer.
- The user's [YouTube reference](https://www.youtube.com/watch?v=747ZnEtsRbg) could not be fetched/transcribed with the current tools (authentication/provider requirement). No findings here are attributed to an unseen transcript. Retrieving that transcript remains an explicit follow-up.
