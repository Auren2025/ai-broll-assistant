---
name: broll-scene-animator
description: Turn approved AI-Broll scene JSON into polished schema-valid layers, visible draft asset placeholders, and narration-timed animations. Use when generating visuals, completing empty scenes, replacing placeholder assets, revising layouts, or changing scene animations.
---

# B-roll Scene Animator

Use this skill for `approved scene JSON -> visual layers and animations`. Scene selection and timing are inputs, not decisions to redo here.

The workspace root contains the agent configuration. Treat `app/` as the application root: paths such as `projects/` and `src/` are relative to `app/`, and all pnpm scripts run with `app/` as the working directory.

## Persistent Data Boundary

- Read and modify the canonical `project.json` and `scenes/*.json` only.
- Do not create a second storyboard, Fabric serialization, Remotion-specific scene copy, or frame-by-frame animation data.
- Preserve `scene.id`, `topic`, `startFrame`, and `durationInFrames` unless the user explicitly requests replanning through `broll-scene-planner`.

## Workflow

1. **Inspect before writing.** Read `AGENTS.md`, `VISUAL_STYLE.md`, current schemas under `src/domain/`, `project.json`, all requested scene files, the corresponding SRT cues, and available `assets/`. Confirm the editor is closed or not writing. For an existing scene, preserve valid manual layout, IDs, styles, animation choices, and unrelated layers.

2. **Confirm the target.** Operate only on approved empty scenes or scene IDs explicitly named by the user. If timing, scene purpose, or boundaries are ambiguous, stop and route the task back to `broll-scene-planner`; do not silently reinterpret the scene plan.

3. **Build one stable visual model.** Translate the approved visual proposition into one primary composition that can remain on screen throughout an extended explanation. Decide the hero visual object, primary relationship or action, necessary labels, supporting elements, and reading order before creating layers. Prefer a small number of purposeful objects over decorative filler, but never use that preference to shrink the foreground or fall back to a title plus generic cards. If the idea normally depends on a recognizable logo, icon, screenshot, interface, or illustration, plan an Image placeholder instead of translating it into text boxes. Supporting detail may enrich the composition, but it must not introduce another proposition or make a spoken aside look structurally important. Use only supported layer types: `text`, `image`, `rectangle`, `circle`, `triangle`, `arrow`, and non-nested `group`.

4. **Compose for the actual canvas.**
   - Respect project width and height; use consistent margins and spacing proportional to the canvas.
   - Make the hero object, primary relationship, and conclusion immediately recognizable at the editor's ordinary reduced preview size; whitespace must frame the focal point rather than result from undersized content.
   - Keep the primary message readable at preview size and avoid overly long on-screen copy. A short conclusion may be a large visual object instead of a routine top-centered title.
   - Maintain clear contrast between text and its immediate background while preserving transparent output outside designed elements.
   - Avoid unintended overlaps, clipped content, off-canvas layers, and crowded edge placement.
   - Use alignment, repetition, and semantic color to establish hierarchy. Select a composition pattern from the visual meaning described in `VISUAL_STYLE.md`; do not repeat one generic card layout across unrelated visual ideas.
   - Create a group only when at least two children should transform together; an existing group may retain one child after deletion or removal, and an empty group must be removed. Children use group-local coordinates and groups may not nest.

5. **Use the draft-first asset workflow.** Image layers with loaded media may reference only confirmed files already under the target project's `assets/`. Never invent a filename, use an absolute path, or auto-download an asset unless the user separately authorizes an asset-search or download task.
   - When the user will provide an image later, create an Image with `src: null` and `fit: "contain"`, sized and placed exactly as the final asset should be.
   - Pair every placeholder Image with a separate visible top-level Text layer that briefly states the required asset and its key constraint, such as subject, aspect ratio, transparency, or screenshot region. Overlay the note inside the placeholder by default, keep it visually subordinate, and place it immediately above the Image in z-order. Do not group the note with the Image, so the user can delete it directly after replacement. If the placeholder is animated, give the note the same reveal timing and any necessary matching motion so they stay aligned in the draft.
   - Keep the full requirement in the Image `name`; name the note so it can be matched to the Image layer ID. The visible note is production guidance for the draft video, not final audience copy.
   - A scene with any `src: null` Image or paired asset note is a draft scene. It may be previewed or rendered as a draft when the user explicitly asks.
   - After the user uploads the real asset, preserve the Image geometry, fit, style, z-order, and animation, then delete the paired asset-note Text. A scene is final only when all required Images are loaded and no asset notes remain.

6. **Map only approved information changes to frames.** For an approved reveal at `cueStartMs`:
   ```text
   globalCueFrame = floor(cueStartMs * fps / 1000)
   localCueFrame = globalCueFrame - scene.startFrame
   ```
   Clamp animation windows to the scene and place them around the narration that changes the visual model. Explanatory cues between reveals intentionally leave the composition unchanged. Do not create an animation merely because a cue mentions a visible element, rephrases an idea, gives an example, or adds rhetorical emphasis.

7. **Design restrained motion.**
   - No animation is the default. Add motion only when a new key object appears, a relationship is established or changed, a process advances, or comprehension requires a focus shift.
   - Before adding an event, ask whether removing it would harm understanding of the principle, structure, or relationship. If not, keep the layer static.
   - A scene may hold the same composition through many subtitle cues and a long explanation. Never add motion merely to avoid monotony or acknowledge each sentence.
   - Build In (`enter`) introduces a key element at or shortly before the narration first needs it; it does not require every layer to enter separately.
   - Action (`emphasis`) changes an already visible element's position, size, or opacity only when the visual model must change or focus must move.
   - Build Out (`exit`) is optional and should clarify a transition rather than animate everything away by default.
   - Optional visual enrichment should normally remain static or share a restrained entrance with its parent composition; it must not create extra narrative beats.
   - Across a scene or project, do not let all meaningful changes collapse into similar Build In events. When the narration changes a relationship, state, process stage, output, or necessary focus, use the appropriate connector reveal or `magic-move` transition if it improves comprehension.
   - Build In allows `fade-and-move`, `line-draw`, `wipe`, `dissolve-in`, `scale-in`, or `scale-big`. Fade and Move uses four cardinal directions and a percentage `travelDistance`. Line Draw requires an effective Rectangle, Circle, Triangle, or Arrow stroke; closed shapes use `clockwise` / `counterclockwise`, while Arrow uses `start-to-end` / `end-to-start`. Wipe uses four cardinal or four diagonal reveal directions. Scale In requires `direction: up | down` and a boolean `bounce`; Scale Big and Dissolve In have no preset-specific fields. Prefer Fade and Move unless another preset better explains how the visual is established, and use Bounce only for intentional settling feedback.
   - Action only allows `magic-move`, with relative `translateX` / `translateY`, a uniform animation-only `scale`, and an `opacity` multiplier. The completed action holds its target state.
   - Build Out only allows `dissolve`. Allowed easings are `linear`, `ease-in`, `ease-out`, and `ease-in-out`.
   - Every animation uses scene-local integer frames, lasts at least one frame, ends within the scene, and reaches its preset final state on its last frame.
   - Each animatable top-level layer or Group has at most one animation per phase. Group children inherit the Group animation; do not add or edit child animations. Existing child animations are supported only for legacy reading and rendering, not as a pattern for new generation. Moving a layer into or out of a Group permanently clears that layer's own animations; do not save an animation backup for later restoration.

8. **Write complete schema-valid layers.** Include every field required by the current schemas. Keep all layer IDs unique across the scene, top-level `zIndex` values unique, child `zIndex` values unique within each group, and animation IDs unique within each layer. `width` and `height` are the only persisted base visual dimensions; `magic-move.scale` is an animation-only relative multiplier and must not be copied into layer geometry.

9. **Validate after every affected batch.** Run:
   ```bash
   pnpm validate:project projects/<project-id>
   ```
   Fix schema, missing-asset, overlap, ordering, and animation-window errors before reporting completion. Transparent timeline gaps are valid.

10. **Require visual review, not automatic rendering.** Ask the user to inspect the scene at its opening, each necessary information change, and its completed frame in the editor or Remotion Player. Report the scene IDs changed, hero composition, draft/final state, and an exact list of missing assets. Check the scene at reduced preview size and compare its foreground completion, hierarchy, and visual identity with `VISUAL_STYLE.md`. Iterate only on affected scenes. Render video or export HTML only when explicitly requested; label an output as draft whenever placeholders or asset notes remain.

## Quality Gate

- The final composition communicates the approved scene purpose without rereading subtitles verbatim.
- One stable primary composition carries the scene; explanatory narration does not force visual churn.
- The composition has a clear hero visual object and remains complete when judged independently of the final video's background, subtitles, and channel packaging.
- Primary and secondary information have an obvious reading order.
- Text is readable, aligned, and inside the canvas with adequate contrast.
- Recognizable products, tools, interfaces, and illustrations use real Image layers or explicit draft placeholders instead of generic text-card substitutes.
- The same title-and-card template is not repeated across unrelated scenes, and color identities serve meaning rather than one global gray-and-orange fallback.
- Every animation event corresponds to a necessary change in the audience's visual model using scene-local timing.
- Motion is purposeful and does not distract from narration.
- Existing manual work and all timing anchors remain intact.
- Project validation passes and referenced assets exist.
- Draft review lists every unresolved placeholder; final review contains no `src: null` Image and no visible asset-note Text.

## Prohibited Actions

- Do not add, remove, merge, split, or retime scenes while animating.
- Do not regenerate unrelated scenes.
- Do not animate every subtitle, sentence, named concept, example, or rhetorical emphasis.
- Do not add decorative motion solely to prevent a stable composition from feeling static.
- Do not call a placeholder scene final or silently leave asset-note Text in a final render/export.
- Do not persist Fabric.js private JSON or Remotion-specific scene data.
- Do not add unsupported layer types, arbitrary keyframes, expressions, or base layer scale fields.
- Do not modify application source, schemas, adapters, or build configuration.
