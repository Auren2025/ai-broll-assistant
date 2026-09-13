---
name: project-memory
description: Review and persist AI-Broll discussion memory only after user confirmation. Use when the user asks to remember, runs memory-review, finishes a substantial project discussion, resumes a saved project, or decides whether an idea belongs to one work, product evolution, or AGENTS.md.
---

# Project Memory

Use this skill to preserve useful discussion context without turning every conversation into a permanent rule.

## Storage

- `app/projects/<projectId>/MEMORY.md`: decisions, feedback, unresolved questions, follow-up work, and rejected approaches that apply only to one creative project.
- `docs/EVOLUTION.md`: candidate improvements, current methods, experiments, outcomes, and superseded approaches that apply across projects.
- `AGENTS.md`: only the small set of long-term foundational facts explicitly confirmed by the user. Never promote an item here merely because it worked once or appears repeatedly.

Memory files provide discussion context. They do not replace source inputs, Project / Scene data, application code, or current implementation documentation.

## Reading Memory

- When resuming a named creative project, read its `MEMORY.md` if it exists. Do not load memories from unrelated projects.
- When discussing or implementing a tool-wide improvement, read the relevant sections of `docs/EVOLUTION.md`.
- Treat newer confirmed entries that explicitly supersede older entries as current. If two entries conflict without a clear replacement, ask the user rather than choosing silently.

## Review Before Writing

At the end of a substantial discussion, or when explicitly requested, extract only information likely to matter in a later session. Present a concise numbered list using these labels:

- `当前作品决定`
- `当前作品反馈`
- `当前作品待办`
- `跨作品改进候选`
- `实验结果`
- `候选长期偏好`
- `根本事实候选`

For every item, state the proposed wording and destination file. Do not write anything until the user confirms the exact items. The user may approve, edit, reject, narrow, or promote each item independently.

Do not propose storing:

- complete chat transcripts or routine progress narration;
- secrets, credentials, personal sensitive data, or machine-specific transient state;
- temporary debugging details with no expected future value;
- facts already obvious from current source files;
- inferred preferences presented as confirmed decisions.

## Writing Confirmed Memory

Create `app/projects/<projectId>/MEMORY.md` only after at least one project-specific item is confirmed. Use this structure and omit empty sections when practical:

```md
# Project Memory

## Goal And Inputs

## Confirmed Decisions

## Feedback And Observations

## Open Questions And Follow-up

## Rejected Or Superseded
```

- Keep entries short, dated with `YYYY-MM-DD`, and understandable without the original conversation.
- Record scope and rationale when they affect later interpretation.
- Update or move an existing entry instead of adding a contradictory duplicate.
- Mark an old decision as superseded rather than silently deleting useful history.
- Do not copy a detailed storyboard, layer list, or current scene state into memory; those belong in the actual project data.
- For `docs/EVOLUTION.md`, place the confirmed item in the matching existing section and remove the `目前没有记录。` placeholder when adding the first item.
- Change `AGENTS.md` only when the user explicitly confirms that an item is a foundational long-term fact.

After writing, report exactly which files changed and summarize the stored entries.
