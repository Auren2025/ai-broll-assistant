import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { parseSrt } from "../src/srt/parseSrt";
import type { SubtitleCue } from "../src/domain/subtitleCueSchema";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_GAP_MS = 1500;
const MIN_SCENE_FRAMES = 30;
const PROJECTS_ROOT = resolve("projects");

function frameFromMs(ms: number, fps: number, mode: "floor" | "ceil"): number {
  return mode === "floor"
    ? Math.floor((ms * fps) / 1000)
    : Math.ceil((ms * fps) / 1000);
}

function groupCues(cues: readonly SubtitleCue[], gapMs: number): SubtitleCue[][] {
  const groups: SubtitleCue[][] = [];

  for (const cue of cues) {
    const current = groups.at(-1);
    const previous = current?.[current.length - 1];

    if (current && previous && cue.startMs - previous.endMs < gapMs) {
      current.push(cue);
    } else {
      groups.push([cue]);
    }
  }

  return groups;
}

async function buildSkeleton(
  projectId: string,
  gapMs: number,
  force: boolean,
): Promise<void> {
  if (!ID_PATTERN.test(projectId)) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }

  const projectDir = resolve(PROJECTS_ROOT, projectId);
  const project = parseProject(
    JSON.parse(await readFile(resolve(projectDir, "project.json"), "utf-8")),
  );
  const srtPath = resolve(projectDir, "source.srt");
  const cues = parseSrt(await readFile(srtPath, "utf-8"));

  if (!force) {
    for (const reference of project.scenes) {
      const raw = await readFile(resolve(projectDir, reference.file), "utf-8");
      const existing = parseScene(JSON.parse(raw));
      if (existing.layers.length > 0) {
        throw new Error(
          `Scene "${reference.id}" already contains layers; pass --force to ` +
            "regenerate the skeleton from the SRT.",
        );
      }
    }
  }

  const fps = project.fps;
  const groups = groupCues(cues, gapMs);

  const groupStarts = groups.map(
    (group) => frameFromMs(group[0].startMs, fps, "floor"),
  );
  const groupEnds = groups.map(
    (group) =>
      frameFromMs(group[group.length - 1].endMs, fps, "ceil"),
  );

  const scenes: Scene[] = groups.map((group, index) => {
    const startFrame = index === 0 ? 0 : groupStarts[index];
    const nextStart =
      index < groups.length - 1 ? groupStarts[index + 1] : groupEnds[index];
    const durationInFrames = Math.max(
      MIN_SCENE_FRAMES,
      nextStart - startFrame,
    );
    const firstLine = group[0].text.split("\n")[0].trim();
    const topic =
      firstLine.slice(0, 60) || `Scene ${index + 1}`;

    return parseScene({
      schemaVersion: 1,
      id: `scene-${String(index + 1).padStart(3, "0")}`,
      topic,
      startFrame,
      durationInFrames,
      layers: [],
    });
  });

  const nextProject = parseProject({
    ...project,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      file: `scenes/${scene.id}.json`,
    })),
  });

  await Promise.all(
    scenes.map((scene) =>
      writeFile(
        resolve(projectDir, "scenes", `${scene.id}.json`),
        `${JSON.stringify(scene, null, 2)}\n`,
        "utf-8",
      ),
    ),
  );
  await writeFile(
    resolve(projectDir, "project.json"),
    `${JSON.stringify(nextProject, null, 2)}\n`,
    "utf-8",
  );

  console.log(
    `Skeleton built: ${scenes.length} scene(s) from ${cues.length} cue(s) ` +
      `(gap threshold ${gapMs}ms, total ${scenes.at(-1)!.startFrame + scenes.at(-1)!.durationInFrames} frames).`,
  );
  for (const scene of scenes) {
    console.log(
      `  ${scene.id}: frames ${scene.startFrame}-${scene.startFrame + scene.durationInFrames} "${scene.topic}"`,
    );
  }
  console.log("Refine each scene's layers and animations, then validate:");
  console.log(`  npm run validate:project -- projects/${projectId}`);
}

const projectId = process.argv[2];
const gapArg = process.argv[3];
const force = process.argv.includes("--force");
const gapMs = gapArg && !Number.isNaN(Number(gapArg))
  ? Math.max(100, Number(gapArg))
  : DEFAULT_GAP_MS;

if (!projectId) {
  console.error("Usage: npm run skeleton -- <project-id> [gap-ms] [--force]");
  process.exitCode = 1;
} else {
  buildSkeleton(projectId, gapMs, force).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
