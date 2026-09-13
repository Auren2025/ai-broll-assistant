---
name: broll-scene-planner
description: Plan semantic B-roll scenes from a complete SRT and materialize approved timing skeletons. Use when creating a project, selecting B-roll intervals, revising scene boundaries, or asking what scenes a narration needs.
---

# B-roll Semantic Scene Planner

Use this skill for `SRT -> reviewed scene plan`. Do not generate visual layers or animations here.

This is the current default planning method, not a foundational product rule. A user-requested workflow experiment may depart from it when the scope is explicit and existing work is protected. Propose useful outcomes through `project-memory` instead of silently turning one experiment into a permanent rule.

The workspace root contains the agent configuration. Treat `app/` as the application root: paths such as `projects/` and `src/` are relative to `app/`, and all pnpm scripts run with `app/` as the working directory.

## Persistent Data Boundary

- `project.json` and `scenes/*.json` are the only persistent project/scene data.
- Keep an explicitly requested discussion plan in the conversation; otherwise use the internal plan only to produce the authorized full-project first draft.
- Do not create `scene-plan.md`, storyboard JSON, duplicated scene files, or another planning data source.
- For an authorized batch first draft, materialize all planned scenes as canonical scene JSON with concise `topic` values and `layers: []`; never persist a parallel storyboard.

## Workflow

1. **Classify the operation.**
   - **Create/adopt:** an SRT exists but `project.json` does not.
   - **Resume planning:** project data exists but scene selection is incomplete.
   - **Resegment:** scene boundaries or selection will replace existing structure. This is destructive and requires explicit confirmation before changing files with manual work.
   Read `AGENTS.md`, `docs/BROLL_VISUAL_STYLE.md`, the current project if present, and the schemas under `src/domain/`. Consult a relevant available reference using `docs/BROLL_VISUAL_STYLE.md`'s reference guidance; learn its expression method without copying its content or treating an accepted project as an ideal template. Preserve existing IDs and anchors whenever the requested change allows it.

2. **Confirm the source and editor state.** The canonical source is `projects/<project-id>/source.srt`. If it is absent during create/adopt and exactly one other project-root `.srt` exists, preserve its contents and copy it to `source.srt` before validation or planning. Ask the user if none or multiple candidates exist. Before any batch project JSON write, confirm the editor is closed.

3. **Validate and read the complete SRT.** Run:
   ```bash
   pnpm validate:srt projects/<project-id>/source.srt
   ```
    Read the entire narration before proposing the first boundary. Identify the overall argument, chapters, transitions, demonstrations, comparisons, conclusions, and sections intended for product screen recording or deliberate visual whitespace. Never assume talking-head footage exists to carry narration. Scene-by-scene collaboration never means interpreting only a local excerpt.
    For an already initialized project, `pnpm skeleton <project-id>` may be used to print non-mutating pause-based candidate groups. It requires `project.json` for fps, so it is unavailable before create/adopt scaffolding; its output is only an aid and never a semantic proposal or approved scene plan.

4. **Interpret speech by visual function.** Distinguish these categories while reasoning, but never persist them as another data model:
   - content that needs a visual model, such as a principle, structure, relationship, process, comparison, hierarchy, or key evidence;
   - narration that continues to explain the current visual model;
   - narration that does not need a structured B-roll scene, including setup, transitions, repetition, deliberate whitespace, and product screen demonstrations;
   - optional supporting detail that may enrich an existing composition without introducing another visual proposition.

5. **Select visual propositions, not sentences.** Create a scene only when a structured visual materially improves understanding. Give each scene one stable primary composition that can support an extended explanation. Keep elaboration, examples, rewording, emphasis, and repeated conclusions in that composition without creating new scenes. When narration adds a key object, establishes or changes a relationship, advances a process, or requires a focus shift, plan a progressive reveal inside the same scene. Start a new scene when either the core visual proposition or the primary composition needed to carry it genuinely changes. Do not keep appending an unrelated bottom row, generic card, or secondary diagram merely to avoid a new scene. Subtitle gaps, cue counts, cue boundaries, and fixed durations are timing aids only. Leave intentional transparent gaps where no structured visual is useful.

   Before proposing a composition, choose the simplest sufficient expression using `docs/BROLL_VISUAL_STYLE.md`: structured text for lists/categories/paths, real media for product identity or interface evidence, diagrams for relationships/state changes, and actual screen recording for continuous operations. Text and meaningful grouping can form a complete visual proposition; do not force a hero image, invented icon set, connector, or bottom conclusion. When a screenshot carries the explanation, identify the essential visible region instead of merely requesting a generic screenshot.

6. **Build a complete narrative map.** Identify narration chapters, candidate visual propositions, recording intervals, and likely transparent gaps for the whole project. Keep it internal by default so the user can judge a completed draft; present it only when the user explicitly asks to discuss planning.

7. **Plan the complete first draft.** Work in narration order and determine for every candidate:
   - its SRT range and the spoken idea it covers;
   - why that idea benefits from visualization;
   - the simplest suitable expression, stable primary composition, first focal content, and reading order;
   - only the needed image placeholders, specifying their identification/evidence role and required visible region; no images is a valid choice for structured text;
   - the opening state and necessary reveals that introduce information, establish/change relationships, advance a process, or guide reading; distinguish whole-group reveals from items that need individual attention;
   - the explanatory passages that intentionally leave the composition unchanged;
   - optional supporting details, clearly separated from required content;
   - the transparent or held intervals immediately before and after it, and whether an existing visual object should continue from the preceding scene without modifying that completed scene.
   Do not require the user to read or approve this textual detail before production when they have authorized a batch first draft. Use one-scene discussion only when explicitly requested.

8. **Calculate exact timing for every candidate.** Put every scene start on an SRT cue start, except that the first scene may start at project frame 0 when its visual should align with the narration audio file's beginning. This frame-0 exception applies only to the first scene; later scenes still require exact cue anchors. At project FPS:
   ```text
   startFrame = floor(startMs * fps / 1000)
   endFrame = ceil(endMs * fps / 1000)
   durationInFrames = endFrame - startFrame
   ```
   End at the last included narration cue by default. Extend through a pause only when the visual intention explicitly needs to hold. Scenes must be ordered and non-overlapping; leading, internal, and trailing gaps are valid.

9. **Materialize the authorized batch.** Full narration plus user-provided chapter, recording/animation, and visual constraints authorize a complete first-draft batch unless the user asks for planning-only or incremental work.
   - For create/adopt, run `pnpm scaffold <project-id>`, then replace its placeholder and add all planned scenes.
   - Write every planned scene as complete schema-valid canonical data with a concise semantic-and-visual `topic` and `layers: []` before animation begins.
   - Insert scenes in narration order while preserving project settings, audio references, existing valid IDs, and completed scenes outside the requested range.
   - During resegmentation, do not replace or delete unreviewed existing scenes. Obtain explicit confirmation before any approved change that affects manual work.
   - Remove only a newly created scaffold placeholder. Do not silently delete pre-existing scene files.

10. **Validate and hand off the complete batch.** Run:
   ```bash
   pnpm validate:srt projects/<project-id>/source.srt
   pnpm validate:project projects/<project-id>
   ```
   Fix schema, ordering, overlap, reference, and timing errors. Gap warnings are expected for selective B-roll. When invoked through `ai-broll`, hand off the complete batch for animation and visual review. When invoked for planning only, stop after the validated skeletons.

11. **Finish with a global audit.** After all candidates have been discussed, verify that every B-roll interval serves a visual proposition, all omitted narration is intentional, and completed scenes remain ordered and non-overlapping. Do not regenerate approved scenes merely to make the final plan look more uniform.

## Quality Gate

- The complete SRT was read before selection.
- The global map and detailed scene decisions cover the complete requested range; they are not forced on the user as pre-production reading unless requested.
- Every scene has one stable primary composition and one coherent visual proposition.
- The expression suits the information: a text list, semantic container, real screenshot, or relationship diagram is chosen deliberately, not forced into a generic title-and-card or image-heavy template.
- Explanations, examples, rewording, and repetition do not create scenes by themselves.
- Progressive reveals support information changes or necessary reading order, not every subtitle or layer; explanatory passages explicitly hold.
- A long held scene remains long because the same composition genuinely carries the explanation; duration alone does not force a split, but an unexplained extended hold is reviewed rather than accepted automatically.
- At final audit, every omitted interval is intentional rather than accidentally missed.
- Time ranges map to the intended narration and do not overlap.
- The persisted scenes are within the full-project first draft or range explicitly authorized by the user.
- Previously approved and produced scenes remain untouched unless explicitly reopened.
- No parallel storyboard or scene-description file was persisted.

## Prohibited Actions

- Do not use pause-based `pnpm skeleton` output as the final scene plan or imply that it writes project data.
- Do not require the user to read or approve a detailed all-scenes table before producing an authorized first draft.
- Do not turn each subtitle, sentence, spoken concept, example, or rhetorical emphasis into a scene candidate.
- Do not generate layers or animations in this skill.
- Do not shift an existing narration anchor merely to remove a transparent gap.
- Do not overwrite manual scenes without explicit resegmentation approval.
- Do not revise completed scenes outside the authorized batch or later feedback scope unless the user explicitly reopens them.
- Do not modify application source, schemas, adapters, or build configuration.
