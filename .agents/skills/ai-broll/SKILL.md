---
name: ai-broll
description: Orchestrate AI-Broll projects from SRT planning through draft placeholder video, asset replacement, and final scene animation. Use when processing a whole project or when the request spans scene selection, project creation, layout, animation, and draft-to-final completion.
---

# AI B-roll Project Orchestrator

This skill routes work between two specialized stages. It does not duplicate their detailed procedures.

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

## Incremental Approval Loop

For a new project or resegmentation:

```text
Complete SRT
-> concise global narrative map
-> one broll-scene-planner candidate
-> user reviews its boundary, stable composition, required reveals, and gaps
-> explicit approval for that scene
-> canonical scene JSON with layers: []
-> broll-scene-animator for that scene, including visible asset placeholders when needed
-> data validation, Agent visual self-review where accessible, and user draft review
-> preserve the approved draft scene and repeat with the next candidate
-> full-project draft audit and optional draft render
-> user replaces placeholder images and removes the paired asset notes
-> final visual review and global audit
```

- Read and understand the complete SRT before the first candidate, but never make scene-by-scene collaboration depend on reading only local subtitle excerpts.
- Keep the initial map brief. It establishes direction and does not require the user to review or approve a detailed all-scenes proposal.
- Apply `VISUAL_STYLE.md` and its reference guidance before the first design. `my-design` is the primary user-liked manual style reference; the named OpenCode examples contribute specific expression methods, not an all-purpose ideal template. Missing local references must be reported, not reconstructed.
- Never skip approval for the current candidate and proceed directly from SRT to animation.
- A correction request means revise the proposal; it is not approval.
- Approval applies only to the current scene or an explicitly named set; it does not approve unreviewed candidates.
- By default, complete the approved scene through draft animation and visual review before discussing the next scene, but wait until the full draft video is complete before replacing assets so the user can collect all requirements in one pass. Replace an individual scene's assets earlier only when the user explicitly asks. Use a planning-only batch workflow only when the user explicitly requests it.
- Treat a completed canonical scene as progress. Do not regenerate or modify it while processing later scenes unless the user explicitly reopens it. This is a workflow rule, not a persisted lock field.
- After feedback, briefly distinguish the specific correction from any explicitly stated broader preference and apply the latter to subsequent relevant scenes in this conversation. Do not infer that "acceptable" approves every design detail as a permanent preference, silently update rules, or retrofit completed scenes. Persist broader preferences in `VISUAL_STYLE.md` only when the user asks or confirms.
- Do not persist the unapproved proposal as another file or data model.

## Operation Modes

- **Create/adopt:** build one draft vertical slice at a time: planner approval, empty canonical scene, animator, validation, and draft visual review, then the next candidate. After the full draft is approved, collect and replace all placeholder assets before final review.
- **Resume approved project:** inspect canonical scene JSON and the available conversation/task context. Use planner for unresolved timing/selection and animator only for scenes whose approval is explicit; `layers: []` alone is not proof of approval because an intentionally transparent scene may also be empty.
- **Modify visuals:** animator only; preserve scene IDs and timing.
- **Resegment existing project:** planner first, preserve unreviewed existing scenes, and require destructive-change confirmation before replacing manual scene structure in each affected range.
- **Draft render:** validate first and execute only when explicitly requested. A render containing `src: null` Images or visible asset notes must be reported as a draft and include the outstanding asset list.
- **Final render/export:** require all necessary Images to be loaded and all paired asset-note Text layers to be removed, then validate and execute only when explicitly requested. Start the local server with `pnpm dev:server` before `pnpm render:project <project-id>`; rendering writes silent alpha ProRes 4444. HTML export uses `pnpm export:html <project-id>` and currently does not include narration audio.

## Shared Boundaries

- `project.json` and `scenes/*.json` are the only persistent project/scene source.
- `VISUAL_STYLE.md` is the single source for foreground composition and style preferences; stage skills should apply it rather than duplicate its visual rules.
- Keep the editor closed during OpenCode/Pi batch writes.
- Modify only the requested project and preserve unrelated manual work.
- Treat transparent timeline gaps as valid B-roll behavior.
- Never modify application source, schemas, adapters, or build configuration while processing project data.
- Never call external model APIs, invent asset paths, bypass schemas, or commit automatically.

## Completion

After each draft vertical slice, report the approved scene ID, primary composition, data validation result, actual visual review coverage or its unavailable status, draft state, and exact asset follow-up, then present only the next candidate when the user is ready. Data validation alone does not establish visual quality. Follow the animator's self-review procedure before asking for user approval when preview is accessible; if it is not, explicitly request user inspection rather than claiming the scene visually passed. At full-draft completion, consolidate every placeholder requirement into one asset checklist for the user's replacement pass. Do not treat a visually approved draft as final until its placeholder Images are replaced and asset-note Text layers are removed. At final completion, report the global audit. Do not render or export unless the user requested it.
