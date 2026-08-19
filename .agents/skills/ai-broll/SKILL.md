---
name: ai-broll
description: Orchestrate AI-Broll projects from SRT planning through approved scene animation. Use when processing a whole project or when the request spans scene selection, project creation, layout, and animation.
---

# AI B-roll Project Orchestrator

This skill routes work between two specialized stages. It does not duplicate their detailed procedures.

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

## Required Approval Boundary

For a new project or resegmentation:

```text
Complete SRT
-> broll-scene-planner proposal
-> user reviews boundaries, gaps, topics, and visual intent
-> explicit approval
-> canonical project/scene JSON with layers: []
-> broll-scene-animator
-> validation
-> editor/player review
```

- Never skip proposal approval and proceed directly from SRT to animation.
- A correction request means revise the proposal; it is not approval.
- Approval may cover all proposed scenes or an explicitly named subset.
- Do not persist the unapproved proposal as another file or data model.

## Operation Modes

- **Create/adopt:** planner first, then animator only after approval.
- **Resume approved project:** inspect canonical scene JSON. Use planner for unresolved timing/selection and animator for approved empty scenes.
- **Modify visuals:** animator only; preserve scene IDs and timing.
- **Resegment existing project:** planner first and require destructive-change confirmation before replacing manual scene structure.
- **Render/export:** validate first and execute only when explicitly requested. Rendering also requires the local server, writes alpha ProRes 4444, and is silent by default even when preview audio is configured.

## Shared Boundaries

- `project.json` and `scenes/*.json` are the only persistent project/scene source.
- Keep the editor closed during OpenCode/Pi batch writes.
- Modify only the requested project and preserve unrelated manual work.
- Treat transparent timeline gaps as valid B-roll behavior.
- Never modify application source, schemas, adapters, or build configuration while processing project data.
- Never call external model APIs, invent asset paths, bypass schemas, or commit automatically.

## Completion

For planning completion, report the approved scene skeleton and validation result. For animation completion, report changed scene IDs, visual concepts, validation result, and any targeted visual-review or asset follow-up. Do not render or export unless the user requested it.
