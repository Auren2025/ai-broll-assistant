---
name: ai-broll
description: Orchestrate AI-Broll projects from SRT planning through draft placeholder video, asset replacement, and final scene animation. Use when processing a whole project or when the request spans scene selection, project creation, layout, animation, and draft-to-final completion.
---

# AI B-roll Project Orchestrator

This skill routes work between two specialized stages. It does not duplicate their detailed procedures.

This file describes the current default B-roll workflow, not an immutable product specification. Follow it for ordinary production, but when the user is exploring a different method, preserve existing work and treat the experiment as scoped rather than rejecting it merely because it differs from this file. Use `project-memory` to propose durable lessons after the user has evaluated the result.

The workspace root contains the agent configuration. Treat `app/` as the application root: resolve project and source paths from it, and run all pnpm scripts with `app/` as the working directory.

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

## Batch-First Draft Loop

For a new project or resegmentation:

```text
Complete SRT
-> user-provided chapters, recording/animation direction, and constraints
-> internal full-project narrative map and semantic scene plan
-> canonical JSON for all first-draft scenes
-> broll-scene-animator for the complete draft, including visible asset placeholders when needed
-> data validation and Agent visual self-review where accessible
-> user reviews the completed draft and gives concrete feedback
-> revise only affected scenes and repeat full-draft review as needed
-> full-project draft audit and optional draft render
-> user replaces placeholder images and removes the paired asset notes
-> final visual review and global audit
```

- Read and understand the complete SRT before writing any scene. Build the narrative map and detailed scene plan internally unless the user explicitly asks to discuss them.
- Apply `docs/BROLL_VISUAL_STYLE.md` and its reference guidance before the first design. `my-design` is the primary user-liked manual style reference; the named OpenCode examples contribute specific expression methods, not an all-purpose ideal template. Missing local references must be reported, not reconstructed.
- Once the user has supplied the full narration, chapter markers, recording/animation direction, and necessary constraints, treat that as authorization to create the complete first draft without scene-by-scene proposal approval. The draft is a concrete proposal, not final visual approval.
- Do not stop at a detailed textual storyboard when the user needs to see completed visuals before forming an opinion. Make the design decisions, implement them, validate them, and preview them where accessible.
- Use the incremental one-scene approval loop only when the user explicitly requests it or when a destructive resegmentation would affect existing manual work.
- Wait until the full draft is complete before replacing assets so the user can collect all requirements in one pass. Replace an individual scene's assets earlier only when the user explicitly asks.
- Treat a completed canonical scene as progress. Do not regenerate or modify it while processing later scenes unless the user explicitly reopens it. This is a workflow rule, not a persisted lock field.
- After feedback, briefly distinguish the specific correction from any explicitly stated broader preference and apply the latter to subsequent relevant scenes in this conversation. Do not infer that "acceptable" approves every design detail as a permanent preference, silently update rules, or retrofit completed scenes. Persist broader preferences in `docs/BROLL_VISUAL_STYLE.md` only when the user asks or confirms.
- Do not persist the unapproved proposal as another file or data model.

## Operation Modes

- **Create/adopt:** after full-source analysis and user direction, create and animate the complete first draft in one batch, validate it, visually self-review it, and then request feedback on the actual result. After the full draft is approved, collect and replace all placeholder assets before final review.
- **Resume project:** inspect canonical scene JSON and the available conversation/task context. Complete the explicitly requested range as a batch while preserving unrelated manual work; `layers: []` alone does not prove whether a scene is unfinished or intentionally transparent.
- **Modify visuals:** animator only; preserve scene IDs and timing.
- **Resegment existing project:** planner first, preserve unreviewed existing scenes, and require destructive-change confirmation before replacing manual scene structure in each affected range.
- **Draft render:** validate first and execute only when explicitly requested. A render containing `src: null` Images or visible asset notes must be reported as a draft and include the outstanding asset list.
- **Final render/export:** require all necessary Images to be loaded and all paired asset-note Text layers to be removed, then validate and execute only when explicitly requested. Start the local server with `pnpm dev:server` before `pnpm render:project <project-id>`; rendering writes silent alpha ProRes 4444. HTML export uses `pnpm export:html <project-id>` and currently does not include narration audio.

## Shared Boundaries

- `project.json` and `scenes/*.json` are the only persistent project/scene source.
- `docs/BROLL_VISUAL_STYLE.md` is the single source for current B-roll foreground composition and style observations; stage skills should apply it rather than duplicate its visual guidance.
- Keep the editor closed during OpenCode/Pi batch writes.
- Modify only the requested project and preserve unrelated manual work.
- Treat transparent timeline gaps as valid B-roll behavior.
- Never modify application source, schemas, adapters, or build configuration while processing project data.
- Never call external model APIs, invent asset paths, bypass schemas, or commit automatically.

## Completion

At full-draft completion, report the completed scope, data validation result, actual visual review coverage or its unavailable status, draft state, and consolidated asset checklist. Data validation alone does not establish visual quality. Follow the animator's self-review procedure before asking for user feedback when preview is accessible; if it is not, explicitly request user inspection rather than claiming the scenes visually passed. Do not treat a visually approved draft as final until its placeholder Images are replaced and asset-note Text layers are removed. At final completion, report the global audit. Do not render or export unless the user requested it.
