---
name: broll-scene-planner
description: Plan semantic B-roll scenes from a complete SRT and materialize approved timing skeletons. Use when creating a project, selecting B-roll intervals, revising scene boundaries, or asking what scenes a narration needs.
---

# B-roll Semantic Scene Planner

Use this skill for `SRT -> reviewed scene plan`. Do not generate visual layers or animations here.

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
   Read `AGENTS.md`, the current project if present, and the schemas under `src/domain/`. Preserve existing IDs and anchors whenever the requested change allows it.

2. **Confirm the source and editor state.** The canonical source is `projects/<project-id>/source.srt`. If it is absent during create/adopt and exactly one root-level `.srt` exists, preserve its contents and normalize it to `source.srt`. Ask the user if none or multiple candidates exist. Before any project JSON write, confirm the editor is closed or not writing.

3. **Validate and read the complete SRT.** Run:
   ```bash
   npm run validate:srt -- projects/<project-id>/source.srt
   ```
    Read the entire narration before proposing the first boundary. Identify the overall argument, chapters, transitions, demonstrations, comparisons, conclusions, and sections intended for talking head or screen recording.
    `npm run skeleton -- <project-id>` may be used to print non-mutating pause-based candidate groups, but its output is only an aid and never a semantic proposal or approved scene plan.

4. **Select B-roll intervals semantically.** Create a scene only where a structured visual adds useful information. Use topic, argument, step, comparison, and narrative-purpose changes to decide boundaries. Subtitle gaps, cue counts, cue boundaries, and fixed durations are supporting signals only. Keep one coherent visual intention together even across several cues or pauses. Reconsider the scene when meaning changes even without a pause. Leave intentional transparent gaps for narration, talking head, and screen demonstrations that do not need B-roll.

5. **Calculate exact timing.** Put selected boundaries on SRT cue boundaries unless the user explicitly supplies another audio anchor. At project FPS:
   ```text
   startFrame = floor(startMs * fps / 1000)
   endFrame = ceil(endMs * fps / 1000)
   durationInFrames = endFrame - startFrame
   ```
   End at the last included narration cue by default. Extend through a pause only when the visual intention explicitly needs to hold. Scenes must be ordered and non-overlapping; leading, internal, and trailing gaps are valid.

6. **Present the complete proposal before writing.** Include one row per proposed scene:

   | Scene | SRT cues | Time | Frames | Semantic purpose | What the audience sees | Assets | Gap rationale |
   |---|---|---|---|---|---|---|---|

   Also summarize the narration sections deliberately left without B-roll. A proposed `topic` must describe both the semantic point and visual purpose; never copy the first subtitle as a substitute for analysis.

7. **Stop for explicit approval.** Do not scaffold, replace scene references, or write scene JSON before the user approves the proposal. If the user requests changes, revise the proposal and ask again. Approval of one subset does not approve unrelated scenes.

8. **Materialize only the approved plan.**
   - For create/adopt, run `npm run scaffold -- <project-id>` only after approval, then replace its placeholder scene and references with approved scenes.
   - Write complete schema-valid `project.json` and scene files with `layers: []`.
   - Preserve approved timing, existing valid IDs, project settings, audio references, and unrelated manual data.
   - Remove a newly created scaffold placeholder from the final references and files. Do not silently delete pre-existing scene files.

9. **Validate the canonical skeleton.** Run:
   ```bash
   npm run validate:srt -- projects/<project-id>/source.srt
   npm run validate:project -- projects/<project-id>
   ```
   Fix schema, ordering, overlap, reference, and timing errors. Gap warnings are expected for selective B-roll. Report that the approved skeleton is ready for `broll-scene-animator`; do not generate layers unless the user also asked to continue after approval.

## Quality Gate

- The complete SRT was read before selection.
- Every scene has one coherent semantic and visual purpose.
- Every omitted interval is intentional, not an accidental missed section.
- Time ranges map to the intended narration and do not overlap.
- The user approved the proposal before persistent scene data changed.
- No parallel storyboard or scene-description file was persisted.

## Prohibited Actions

- Do not use pause-based `npm run skeleton` output as the final scene plan or imply that it writes project data.
- Do not generate layers or animations in this skill.
- Do not shift an existing narration anchor merely to remove a transparent gap.
- Do not overwrite manual scenes without explicit resegmentation approval.
- Do not modify application source, schemas, adapters, or build configuration.
