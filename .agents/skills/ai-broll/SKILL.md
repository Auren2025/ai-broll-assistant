---
name: ai-broll
description: Generate and modify AI-Broll-Assistant projects and scene JSON from SRT subtitles. Use when creating scenes, revising layouts, or changing layer animations.
---

# AI B-roll Scene Workflow

## Workflow

1. Read `AGENTS.md` and the current schemas under `src/domain/` before making changes. Treat the schemas as the authoritative definition of every supported field, enum, constraint, and relationship.
2. Confirm the target project directory with the user or from the request, such as `projects/video001`. Read its `project.json`, referenced scene files, and existing assets before planning changes.
3. Parse the project's subtitles with:

   ```bash
   npm run --silent parse:srt -- projects/<project-id>/source.srt
   ```

4. Generate only layer types the schemas support: `text`, `rectangle`, `circle`, `triangle`, `arrow`, `image`, and `group`. Do not invent layer types or schema fields.
   - An `image` layer must reference an existing uploaded file under the project's `assets/` (e.g. `assets/image-<id>.png`). Never use an absolute path or reference a file that is not on disk; upload assets through the local service before referencing them.
   - A `group` must contain at least two non-group children, children use group-local coordinates (offset from the group's top-left), and a group must not be nested inside another group.
5. Write complete, explicit JSON objects. Include every field required by the current project, scene, layer, and animation schemas. Every layer must include `animations`, using `[]` when it has no animations. A project must contain at least one scene.
6. Convert subtitle milliseconds to project frames using the `fps` from `project.json`:
   - Start frame: `Math.floor(startMs * fps / 1000)`
   - End frame: `Math.ceil(endMs * fps / 1000)`
   - Derive scene duration from the converted frame boundaries.
   - Scenes are contiguous and non-overlapping on the project timeline. Each scene's `startFrame` must equal the previous scene's `startFrame + durationInFrames` (the first scene starts at 0). After creating, deleting, or changing the duration of a scene, reflow the `startFrame` of every later scene so the sequence stays contiguous.
7. Keep layer IDs and `zIndex` values unique within each scene. Keep animation IDs unique within each layer. A layer may have at most one animation for each `enter`, `emphasis`, and `exit` phase. Animation frame values are scene-local, and `animation.startFrame + animation.durationInFrames` must not exceed the scene duration.
8. Before changing an existing file, read it. Do not overwrite existing project or scene files without explicit user approval. Preserve existing IDs, valid fields, layout choices, and manual edits wherever possible.
9. For modification requests, change only the scenes or layers explicitly identified by the user. Do not reformat, regenerate, or revise unrelated content.
10. After writing JSON, validate the project with:

    ```bash
    npx tsx scripts/validateProject.ts projects/<project-id>
    ```

    If validation fails, inspect the reported schema or relationship error, correct the JSON, and rerun validation until it passes.

## Prohibited Actions

- Do not call external model APIs.
- Do not add an AI chat interface to the application.
- Do not bypass or weaken the domain schemas.
- Do not persist Fabric.js private serialization data.
- Do not automatically commit Git changes.

## Examples

```text
Use the ai-broll skill to generate scene drafts for video001.

Use the ai-broll skill to change scene-002 to a centered title with a scale emphasis animation.
```
