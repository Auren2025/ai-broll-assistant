---
name: ai-broll
description: Orchestrate AI-Broll projects from SRT planning through approved scene animation. Use when processing a whole project or when the request spans scene selection, project creation, layout, and animation.
---

# AI B-roll Project Orchestrator

This skill routes work between two specialized stages. It does not duplicate their detailed procedures.

The workspace root contains the agent configuration. Treat `app/` as the application root: resolve project and source paths from it, and run all npm scripts with `app/` as the working directory.

## Stage Routing

Load and follow `broll-scene-planner` when the request involves:

- creating or adopting a project from SRT;
- deciding which narration intervals need B-roll;
- semantic scene boundaries, topics, start frames, or durations;
- adding, removing, merging, splitting, or reordering scenes;
- regenerating a project scene structure.

Load and follow `broll-scene-animator` when the request involves:

- filling approved empty scenes with visual layers;
- creating or revising layouts and visual hierarchy;
- timing animation to narration;
- changing text, shapes, images, groups, styles, or animation presets;
- completing or polishing named existing scenes without changing their timing.

## Incremental Approval Loop

For a new project or resegmentation:

```text
Complete SRT
-> concise global narrative map
-> one broll-scene-planner candidate
-> user reviews its boundary, stable composition, required reveals, and gaps
-> explicit approval for that scene
-> canonical scene JSON with layers: []
-> broll-scene-animator for that scene
-> validation and editor/player review
-> preserve the completed scene and repeat with the next candidate
-> final global audit
```

- Read and understand the complete SRT before the first candidate, but never make scene-by-scene collaboration depend on reading only local subtitle excerpts.
- Keep the initial map brief. It establishes direction and does not require the user to review or approve a detailed all-scenes proposal.
- Never skip approval for the current candidate and proceed directly from SRT to animation.
- A correction request means revise the proposal; it is not approval.
- Approval applies only to the current scene or an explicitly named set; it does not approve unreviewed candidates.
- By default, complete the approved scene through animation and visual review before discussing the next scene. Use a planning-only batch workflow only when the user explicitly requests it.
- Treat a completed canonical scene as progress. Do not regenerate or modify it while processing later scenes unless the user explicitly reopens it. This is a workflow rule, not a persisted lock field.
- Do not persist the unapproved proposal as another file or data model.

## Operation Modes

- **Create/adopt:** build one vertical slice at a time: planner approval, empty canonical scene, animator, validation, visual review, then the next candidate.
- **Resume approved project:** inspect canonical scene JSON. Use planner for unresolved timing/selection and animator for approved empty scenes.
- **Modify visuals:** animator only; preserve scene IDs and timing.
- **Resegment existing project:** planner first, preserve unreviewed existing scenes, and require destructive-change confirmation before replacing manual scene structure in each affected range.
- **Render/export:** validate first and execute only when explicitly requested. Rendering also requires the local server, writes alpha ProRes 4444, and is silent by default even when preview audio is configured.

## Shared Boundaries

- `project.json` and `scenes/*.json` are the only persistent project/scene source.
- Keep the editor closed during OpenCode/Pi batch writes.
- Modify only the requested project and preserve unrelated manual work.
- Treat transparent timeline gaps as valid B-roll behavior.
- Never modify application source, schemas, adapters, or build configuration while processing project data.
- Never call external model APIs, invent asset paths, bypass schemas, or commit automatically.

## Completion

After each vertical slice, report the approved scene ID, visual concept, validation result, and targeted visual-review or asset follow-up, then present only the next candidate when the user is ready. At project completion, report the final global audit. Do not render or export unless the user requested it.
