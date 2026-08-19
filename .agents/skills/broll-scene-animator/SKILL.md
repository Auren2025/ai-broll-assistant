---
name: broll-scene-animator
description: Turn approved AI-Broll scene JSON into polished schema-valid layers and narration-timed animations. Use when generating visuals, completing empty scenes, revising layouts, or changing scene animations.
---

# B-roll Scene Animator

Use this skill for `approved scene JSON -> visual layers and animations`. Scene selection and timing are inputs, not decisions to redo here.

## Persistent Data Boundary

- Read and modify the canonical `project.json` and `scenes/*.json` only.
- Do not create a second storyboard, Fabric serialization, Remotion-specific scene copy, or frame-by-frame animation data.
- Preserve `scene.id`, `topic`, `startFrame`, and `durationInFrames` unless the user explicitly requests replanning through `broll-scene-planner`.

## Workflow

1. **Inspect before writing.** Read `AGENTS.md`, current schemas under `src/domain/`, `project.json`, all requested scene files, the corresponding SRT cues, and available `assets/`. Confirm the editor is closed or not writing. For an existing scene, preserve valid manual layout, IDs, styles, animation choices, and unrelated layers.

2. **Confirm the target.** Operate only on approved empty scenes or scene IDs explicitly named by the user. If timing, scene purpose, or boundaries are ambiguous, stop and route the task back to `broll-scene-planner`; do not silently reinterpret the scene plan.

3. **Translate intent into one visual hierarchy.** Decide the primary message, supporting elements, and reading order before creating layers. Prefer a small number of purposeful elements over decorative filler. Use only supported layer types: `text`, `image`, `rectangle`, `circle`, `triangle`, `arrow`, and non-nested `group`.

4. **Compose for the actual canvas.**
   - Respect project width and height; use consistent margins and spacing proportional to the canvas.
   - Keep the primary message readable at preview size and avoid overly long on-screen copy.
   - Maintain clear contrast between text and its immediate background while preserving transparent output outside designed elements.
   - Avoid unintended overlaps, clipped content, off-canvas layers, and crowded edge placement.
   - Use alignment, repetition, and restrained color to establish hierarchy. Do not repeat one generic card layout across unrelated visual ideas.
   - Use groups only when at least two children should transform together; children use group-local coordinates and groups may not nest.

5. **Use assets safely.** Image layers with loaded media may reference only confirmed files already under the target project's `assets/`. Never invent a filename, use an absolute path, or auto-download an asset. When the design needs an image that the user will provide later, create an image layer with `src: null` and `fit: "contain"`; it renders as a gray placeholder. Put the requested image description in a separate text layer so the user can delete it after loading the asset. If an essential final asset is unavailable and a placeholder is not appropriate, ask for that specific asset.

6. **Map narration to scene-local frames.** For a cue or spoken phrase at `cueStartMs`:
   ```text
   globalCueFrame = floor(cueStartMs * fps / 1000)
   localCueFrame = globalCueFrame - scene.startFrame
   ```
   Clamp animation windows to the scene and place them around the narration they explain. Do not use identical timing for every layer when the narration introduces ideas sequentially.

7. **Design restrained motion.**
   - `enter` introduces an element at or shortly before its spoken concept.
   - `emphasis` highlights an already visible element when narration returns to it.
   - `exit` is optional and should clarify a transition rather than animate everything away by default.
   - Allowed presets are `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, and `scale`; allowed easings are `linear`, `ease-in`, `ease-out`, and `ease-in-out`.
   - Every animation uses scene-local integer frames, lasts at least one frame, ends within the scene, and reaches its preset final state on its last frame.
   - Each layer has at most one animation per phase. Parent and child animations must remain understandable when composed.

8. **Write complete schema-valid layers.** Include every field required by the current schemas. Keep all layer IDs unique across the scene, top-level `zIndex` values unique, child `zIndex` values unique within each group, and animation IDs unique within each layer. `width` and `height` are the only persisted visual dimensions; do not introduce scale fields.

9. **Validate after every affected batch.** Run:
   ```bash
   npm run validate:project -- projects/<project-id>
   ```
   Fix schema, missing-asset, overlap, ordering, and animation-window errors before reporting completion. Transparent timeline gaps are valid.

10. **Require visual review, not automatic rendering.** Ask the user to inspect affected scenes in the editor or Remotion Player. Report the scene IDs changed, the visual concept used, and any requested assets still missing. Iterate only on affected scenes. Render video or export HTML only when explicitly requested.

## Quality Gate

- The final composition communicates the approved scene purpose without rereading subtitles verbatim.
- Primary and secondary information have an obvious reading order.
- Text is readable, aligned, and inside the canvas with adequate contrast.
- Animation events correspond to spoken concepts using scene-local timing.
- Motion is purposeful and does not distract from narration.
- Existing manual work and all timing anchors remain intact.
- Project validation passes and referenced assets exist.

## Prohibited Actions

- Do not add, remove, merge, split, or retime scenes while animating.
- Do not regenerate unrelated scenes.
- Do not persist Fabric.js private JSON or Remotion-specific scene data.
- Do not add unsupported layer types, arbitrary keyframes, expressions, or scale fields.
- Do not modify application source, schemas, adapters, or build configuration.
