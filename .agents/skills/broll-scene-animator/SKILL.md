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

1. **Inspect before writing.** Read `AGENTS.md`, `VISUAL_STYLE.md`, current schemas under `src/domain/`, `project.json`, all requested scene files, the corresponding SRT cues, and available `assets/`. Use the reference guidance in `VISUAL_STYLE.md` to inspect a relevant existing example and its actual media when available; do not copy its whole scene, old copy, timing, or asset paths. Read the preceding scene when continuity matters, without modifying it. Confirm the editor is closed before batch writes. For an existing scene, preserve valid manual layout, IDs, styles, animation choices, and unrelated layers.

2. **Confirm the target.** Operate only on approved empty scenes or scene IDs explicitly named by the user. If timing, scene purpose, or boundaries are ambiguous, stop and route the task back to `broll-scene-planner`; do not silently reinterpret the scene plan.

3. **Choose the simplest sufficient expression.** Translate the approved visual proposition using the semantic choices in `VISUAL_STYLE.md`: product identity, structured text, screenshot explanation, or a relationship/state diagram. A list or comparison can itself be the primary composition; do not force an extra hero image, arrow, title, or conclusion. Use real Images or placeholders where identity or evidence depends on actual media, not for every named product or abstract concept. Before creating layers, determine:
   - what the viewer must recognize or understand, and the first visual focus;
   - the minimum content and grouping needed, with a clear reading order;
   - the opening state, each approved information change, what existing content holds/moves/dims/replaces, and the completed state;
   - whether an object from the preceding scene should continue naturally into this one.
   Keep this reasoning in the conversation, not a second storyboard. Preserve a stable primary composition through explanatory passages. Remove supporting detail that adds another proposition or makes a spoken aside structurally important. Use only supported layer types: `text`, `image`, `rectangle`, `circle`, `triangle`, `arrow`, and non-nested `group`.

4. **Compose for the actual canvas.**
   - Respect project width and height; use consistent margins and spacing proportional to the canvas.
   - Make the actual focal content immediately recognizable at the editor's ordinary reduced preview size; whitespace must frame it rather than result from undersized content. Text lists and semantic containers are valid focal content.
   - Keep the primary message readable at preview size and avoid overly long on-screen copy. A short conclusion may be a large visual object instead of a routine top-centered title.
   - Maintain clear contrast between text and its immediate background while preserving transparent output outside designed elements.
   - Avoid unintended overlaps, clipped content, off-canvas layers, and crowded edge placement.
   - Establish hierarchy through position, size, spacing, and grouping before adding bold weight or color. Apply the typography, container, and color preferences in `VISUAL_STYLE.md`; a semantic outline container is valid, but repeated decorative packaging is not.
   - Remove redundant titles, labels already present in media, unnecessary arrows, and repeated bottom conclusions. Do not compensate for a weak composition with more decoration.
   - For continuity, match the preceding scene's actual completed appearance where useful, including completed animation transforms; adjust only the current approved scene. Do not introduce cross-scene private state, retime anchors, or make an HTML page depend on having watched the preceding page.
   - Create a group only when at least two children should transform together; an existing group may retain one child after deletion or removal, and an empty group must be removed. Children use group-local coordinates and groups may not nest.

5. **Use the draft-first asset workflow.** Image layers with loaded media may reference only confirmed files already under the target project's `assets/`. Never invent a filename, use an absolute path, or auto-download an asset unless the user separately authorizes an asset-search or download task.
   - Decide whether each asset serves recognition or detailed explanation. Inspect loaded media before layout. For missing media, specify the subject, full view versus required crop, essential readable fields/region, aspect ratio, and transparency where relevant. Avoid generic requests such as an abstract chapter's "icon set" when text would communicate it directly. Do not assume unsupported crop fields; request the needed cropped source from the user.
   - When the user will provide an image later, create an Image with `src: null` and `fit: "contain"`, sized and placed as the requested final asset should be. Judge the intended audience composition separately from the temporary production note.
   - Pair every placeholder Image with a separate visible top-level Text layer that briefly states the required asset and its key constraint, such as subject, aspect ratio, transparency, or screenshot region. Overlay the note inside the placeholder by default, keep it visually subordinate, and place it immediately above the Image in z-order. Do not group the note with the Image, so the user can delete it directly after replacement. If the placeholder is animated or inside a Group, synchronize the top-level note with its actual canvas-space appearance and motion, including Group transforms; blindly copying local coordinates or scale values is insufficient. Check alignment during motion as well as at rest.
   - Keep the full requirement in the Image `name`; name the note so it can be matched to the Image layer ID. The visible note is production guidance for the draft video, not final audience copy.
   - A scene with any `src: null` Image or paired asset note is a draft scene. It may be previewed or rendered as a draft when the user explicitly asks.
   - After the user uploads the real asset, preserve the Image geometry, fit, style, z-order, and animation, then delete the paired asset-note Text. If the asset does not fit the requested region or readability needs, ask whether to supply a different asset or revise the affected layout; do not silently redesign it. Recheck the actual image and any field highlights. A scene is final only when all required Images are loaded and no asset notes remain.

6. **Map only approved information changes to frames.** For an approved reveal at `cueStartMs`:
   ```text
   globalCueFrame = floor(cueStartMs * fps / 1000)
   localCueFrame = globalCueFrame - scene.startFrame
   ```
   Clamp animation windows to the scene and place them around the narration that changes the visual model. Explanatory cues between reveals intentionally leave the composition unchanged. Do not create an animation merely because a cue mentions a visible element, rephrases an idea, gives an example, or adds rhetorical emphasis.

7. **Design restrained motion.**
   - No animation is the default. Add motion only when a new key object appears, a relationship is established or changed, a process advances, or comprehension requires a focus shift.
   - Before adding an event, ask whether removing it would harm understanding, including a necessary reading order or staged disclosure. If not, keep the layer static. Reading guidance is not a license to animate every sentence or layer.
   - A scene may hold the same composition through many subtitle cues and a long explanation. Never add motion merely to avoid monotony or acknowledge each sentence.
   - Build In (`enter`) introduces a reading unit at or shortly before the narration first needs it. A known Logo or structure may be visible from frame 0. Reveal a region before its contents when that helps orientation; reveal a coherent list together unless individual entries need separate attention. Usually advance one main reading unit at a time rather than competing unrelated regions. Let content settle and remain readable, using the current narration rather than copying reference durations.
   - Action (`emphasis`) changes an already visible element's position, size, or opacity only when the visual model must change or focus must move.
   - Build Out (`exit`) is optional and should clarify a transition rather than animate everything away by default.
   - Optional visual enrichment should normally remain static or share a restrained entrance with its parent composition; it must not create extra narrative beats.
   - Do not optimize for preset variety or an Action quota: a scene or project dominated by simple Build In can be correct. When the meaning depends on synchronization, rollback, movement, or state change, check whether the objects actually show that relationship rather than only introducing a sentence describing it. Use a connector reveal, `magic-move`, or necessary visibility change only if it improves comprehension.
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

10. **Perform visual self-review before user approval.** After data validation, use an accessible editor/Remotion preview to inspect the opening, before and after each key reveal, intermediate motion, the completed frame, and relevant adjacent-scene transitions. Inspect at ordinary reduced preview size and play the sequence, with narration when available. Check focus, readable text and screenshot regions, spacing, motion settling, unintended overlaps, and the alignment of highlights and asset notes. Compare with the applicable reference method in `VISUAL_STYLE.md`, not its exact layout.
    - Fix issues within the approved scope before asking the user to judge the result. Close the editor before further batch JSON writes, revalidate, then preview again. Do not modify data through browser/editor memory or revise unrelated scenes.
    - Report data validation and visual review separately: state what was actually previewed, any remaining concerns, draft/final state, and missing assets. If no preview is accessible, explicitly report visual review as incomplete and ask for user inspection or screenshots; never claim visual success from JSON alone.
    - User approval remains required. Review failures do not authorize replanning or retiming; route those changes to the planner for approval. Render video or export HTML only when explicitly requested; preview inspection is not permission for either.

## Quality Gate

- The final composition communicates the approved scene purpose without rereading subtitles verbatim.
- One stable primary composition carries the scene; explanatory narration does not force visual churn.
- The composition has a clear focal point and reading order, including when structured text is the focal content; it does not depend on final-video packaging or extra decorative elements to feel complete.
- Primary and secondary information have an obvious reading order.
- Text is readable, aligned, and inside the canvas with adequate contrast.
- Where actual identity or evidence is needed, Images or explicit placeholders are used rather than fake logos/interfaces. Pure names, commands, paths, and abstract categories are not forced into image placeholders.
- The same title-and-card template is not repeated across unrelated scenes, and color identities serve meaning rather than one global gray-and-orange fallback.
- Every animation event supports an approved information change or necessary reading sequence using scene-local timing; preset variety is not a quality criterion.
- Actual visual inspection is reported separately from schema validation; unavailable preview and unresolved visual issues are explicit, not hidden behind a completion claim.
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
