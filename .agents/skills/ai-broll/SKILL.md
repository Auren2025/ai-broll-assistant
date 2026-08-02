---
name: ai-broll
description: Generate and modify AI-Broll-Assistant projects and scene JSON from SRT subtitles. Use when creating scenes, revising layouts, or changing layer animations.
---

# AI B-roll Scene Workflow

## 处理项目流程

When the user says "处理 <project-id>" (or asks to create/generate scenes for a project), run this end-to-end procedure:

1. **Confirm the project exists.** Read `AGENTS.md` and the current schemas under `src/domain/` first; treat the schemas as the authoritative definition of every field, enum, constraint, and relationship. If `projects/<project-id>/project.json` does not exist, scaffold it:
   ```bash
   npm run scaffold -- <project-id>
   ```
   (This creates `project.json`, `source.srt`, empty `scene-001.json`, and the `scenes/ assets/ renders/` directories.)

2. **Confirm the source script.** The user places the voiceover at `projects/<project-id>/source.srt`. If it is missing or empty, ask the user to copy it in before continuing. The user may also place the voiceover audio file in `projects/<project-id>/audio/` and reference it in `project.json` (`audioFile: "audio/<file>"`) so it plays in Remotion Studio; do not invent an `audioFile` value that does not exist on disk.

3. **Build the scene skeleton from the SRT.** This splits the subtitles into a contiguous, non-overlapping timeline of empty scenes whose durations match the narration pauses:
   ```bash
   npm run skeleton -- <project-id>
   ```
   Optionally pass a gap threshold in ms (default 1500) to control how aggressively cues are grouped:
   ```bash
   npm run skeleton -- <project-id> 2000
   ```
   Read the generated `projects/<project-id>/scenes/scene-*.json` and `project.json`.

4. **Interpret the script intent and describe scenes.** For each skeleton scene, decide what the audience should SEE while the narration plays, not what the narration says. Map the spoken content to visual concepts:
   - A named tool / brand (opencode, Claude Code, Figma…) → an icon + product name scene.
   - An enumeration ("第一个区别…", "其次…", "最后…") → a comparison / list scene with one card per item.
   - A number or conclusion ("性能提升 3 倍") → a large emphasized number or key point.
   - A question or transition → a pause card that separates sections.
   Keep the scene count aligned with the skeleton; merge or split only when the meaning clearly requires it, keeping the timeline contiguous for a fresh generation. After the first generation, scene `startFrame` values are audio anchors — never shift a later scene to fix a gap created by manual edits.

5. **Generate the layers.** Use only the layer types the schemas support: `text`, `rectangle`, `circle`, `triangle`, `arrow`, `image`, and `group`. Follow these conventions:
   - **Scene 1 (brand/intro):** product icon (image layer) plus a text title; give the icon a `fade` or `scale` enter and the title a `slide-up` enter.
   - **Comparison / list scenes:** a background card (rounded rectangle), a heading, and one row per item. Use distinct `enter` animations staggered by ~8-12 frames so items appear one by one; a `scale` emphasis can highlight each item as it is mentioned.
   - **Key point scenes:** one large text layer with a `scale` emphasis at the moment the number is spoken.
   - **Image layers** reference an existing uploaded file under `assets/` (e.g. `assets/image-<id>.png`). Never invent a filename, use an absolute path, or reference a file that is not on disk. Before using a logo, list `projects/<project-id>/assets/`; if the needed icon is absent, tell the user to upload or drop it into that folder and wait for confirmation before referencing it.
   - **Groups** need at least two non-group children, use group-local child coordinates, and must not nest.
   - Give every layer `animations: []` unless it has a real animation. Presets are `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`; easings are `linear`, `ease-in`, `ease-out`, `ease-in-out`. Keep animation windows inside the scene: `startFrame + durationInFrames <= scene.durationInFrames`.

6. **Write complete, explicit JSON.** Include every field required by the current schemas. Keep layer IDs and `zIndex` values unique within each scene and animation IDs unique within each layer. A layer may have at most one `enter`, one `emphasis`, and one `exit`. Preserve existing IDs, valid fields, layout choices, and manual edits wherever possible; change only the scenes or layers the user asked about.

7. **Validate.** After writing, run:
   ```bash
   npm run validate:project -- projects/<project-id>
   ```
   Fix any schema or relationship error and re-run until it passes. The project must contain at least one scene, and scenes must be non-overlapping and ordered by increasing `startFrame` (first scene at 0). Overlap is always an error; a gap between scenes is allowed (the narration keeps playing) but reported as a warning. Use `npm run validate:project -- projects/<project-id> --strict` to also fail on gaps, which you should keep clean for a freshly generated timeline. After the first generation, never shift a later scene's `startFrame` to restore contiguity — scene starts are audio anchors tied to the narration; later scenes stay put.

## 预览与渲染

- Open the editor for a project with `http://localhost:5173/?project=<project-id>`.
- Preview the whole project in Remotion Studio with `http://localhost:3000/?project=<project-id>`.
- Render the transparent ProRes 4444 B-roll with `npm run render:project -- <project-id>`; the `.mov` is written to `projects/<project-id>/renders/`.

## Prohibited Actions

- Do not call external model APIs.
- Do not add an AI chat interface to the application.
- Do not bypass or weaken the domain schemas.
- Do not persist Fabric.js private serialization data.
- Do not automatically commit Git changes.

## Examples

```text
Use the ai-broll skill to process video-003.
```

```text
Use the ai-broll skill to change scene-002 in video-003 to a centered title with a scale emphasis animation.
```

```text
Use the ai-broll skill to turn the comparison list in scene-003 of video-004 into cards that animate in one by one.
```
