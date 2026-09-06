---
name: broll-scene-planner
description: Plan semantic B-roll scenes from a complete SRT and materialize approved timing skeletons. Use when creating a project, selecting B-roll intervals, revising scene boundaries, or asking what scenes a narration needs.
---

# B-roll Semantic Scene Planner

Use this skill for `SRT -> reviewed scene plan`. Do not generate visual layers or animations here.

The workspace root contains the agent configuration. Treat `app/` as the application root: paths such as `projects/` and `src/` are relative to `app/`, and all pnpm scripts run with `app/` as the working directory.

## Persistent Data Boundary

- `project.json` and `scenes/*.json` are the only persistent project/scene data.
- Keep a proposed plan in the conversation until the user approves it.
- Do not create `scene-plan.md`, storyboard JSON, duplicated scene files, or another planning data source.
- After approval, materialize each approved scene as canonical scene JSON with a concise `topic` and `layers: []`.

## Workflow

1. **Classify the operation.**
   - **Create/adopt:** an SRT exists but `project.json` does not.
   - **Resume planning:** project data exists but scene selection is incomplete.
   - **Resegment:** scene boundaries or selection will replace existing structure. This is destructive and requires explicit confirmation before changing files with manual work.
   Read `AGENTS.md`, `VISUAL_STYLE.md`, the current project if present, and the schemas under `src/domain/`. Preserve existing IDs and anchors whenever the requested change allows it.

2. **Confirm the source and editor state.** The canonical source is `projects/<project-id>/source.srt`. If it is absent during create/adopt and exactly one other project-root `.srt` exists, preserve its contents and copy it to `source.srt` before validation or planning. Ask the user if none or multiple candidates exist. Before any project JSON write, confirm the editor is closed or not writing.

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

6. **Present a concise narrative map.** Before discussing the first scene, show a short global map containing only narration chapters, candidate visual propositions, and likely transparent intervals. The map proves whole-SRT understanding and establishes direction; it is not a detailed scene proposal and does not ask the user to approve every scene at once.

7. **Discuss exactly one candidate scene.** Work in narration order unless the user names another target. Present only the current candidate and include:
   - its SRT range and the spoken idea it covers;
   - why that idea benefits from visualization;
   - the stable primary composition and its hero visual object;
   - the image placeholders likely needed for logos, icons, screenshots, interfaces, or illustrations;
   - only the progressive reveals required to add an object, establish or change a relationship, advance a process, or move necessary focus;
   - the explanatory passages that intentionally leave the composition unchanged;
   - optional supporting details, clearly separated from required content;
   - the transparent or held intervals immediately before and after it.
   Ask the user to confirm, simplify, skip, or adjust the boundary. Do not expand the response into detailed proposals for later scenes.

8. **Calculate exact timing for the current candidate.** Put every scene start on an SRT cue start, except that the first scene may start at project frame 0 when its visual should align with the narration audio file's beginning. This frame-0 exception applies only to the first scene; later scenes still require exact cue anchors. At project FPS:
   ```text
   startFrame = floor(startMs * fps / 1000)
   endFrame = ceil(endMs * fps / 1000)
   durationInFrames = endFrame - startFrame
   ```
   End at the last included narration cue by default. Extend through a pause only when the visual intention explicitly needs to hold. Scenes must be ordered and non-overlapping; leading, internal, and trailing gaps are valid.

9. **Materialize only the current approved scene.** Approval applies only to the candidate being discussed. A correction, simplification, skip, or boundary adjustment is not approval of any later scene.
   - For create/adopt, run `pnpm scaffold <project-id>` only after the first scene is approved, then replace its placeholder with that approved scene.
   - Write the approved scene as complete schema-valid canonical data with a concise semantic-and-visual `topic` and `layers: []` before animation begins.
   - Insert later approved scenes in narration order while preserving project settings, audio references, existing valid IDs, and completed scenes.
   - During resegmentation, do not replace or delete unreviewed existing scenes. Obtain explicit confirmation before any approved change that affects manual work.
   - Remove only a newly created scaffold placeholder. Do not silently delete pre-existing scene files.

10. **Validate and hand off the approved scene.** Run:
   ```bash
   pnpm validate:srt projects/<project-id>/source.srt
   pnpm validate:project projects/<project-id>
   ```
   Fix schema, ordering, overlap, reference, and timing errors. Gap warnings are expected for selective B-roll. Report that the current scene skeleton is ready for `broll-scene-animator`. When invoked through `ai-broll`, hand off this scene for animation and visual review before discussing the next candidate. When invoked for planning only, stop after the validated skeleton.

11. **Finish with a global audit.** After all candidates have been discussed, verify that every B-roll interval serves a visual proposition, all omitted narration is intentional, and completed scenes remain ordered and non-overlapping. Do not regenerate approved scenes merely to make the final plan look more uniform.

## Quality Gate

- The complete SRT was read before selection.
- The global map is concise and detailed review covers only one scene at a time.
- Every scene has one stable primary composition and one coherent visual proposition.
- The planned composition has a recognizable hero object and does not rely on title-and-card fallback.
- Explanations, examples, rewording, and repetition do not create scenes by themselves.
- Progressive reveals are limited to changes that alter the audience's visual model.
- A long held scene remains long because the same composition genuinely carries the explanation; duration alone does not force a split, but an unexplained extended hold is reviewed rather than accepted automatically.
- At final audit, every omitted interval is intentional rather than accidentally missed.
- Time ranges map to the intended narration and do not overlap.
- The user approved each persisted scene before its canonical data changed.
- Previously approved and produced scenes remain untouched unless explicitly reopened.
- No parallel storyboard or scene-description file was persisted.

## Prohibited Actions

- Do not use pause-based `pnpm skeleton` output as the final scene plan or imply that it writes project data.
- Do not present a detailed all-scenes table or require all-scenes approval unless the user explicitly requests that workflow.
- Do not turn each subtitle, sentence, spoken concept, example, or rhetorical emphasis into a scene candidate.
- Do not generate layers or animations in this skill.
- Do not shift an existing narration anchor merely to remove a transparent gap.
- Do not overwrite manual scenes without explicit resegmentation approval.
- Do not revise completed scenes while planning later scenes unless the user explicitly reopens them.
- Do not modify application source, schemas, adapters, or build configuration.
