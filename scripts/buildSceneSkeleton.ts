import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import {
  buildSceneSkeleton,
  DEFAULT_GAP_MS,
} from "../src/domain/sceneSkeleton";
import { parseSrt } from "../src/srt/parseSrt";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROJECTS_ROOT = resolve("projects");

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

  const scenes = buildSceneSkeleton(cues, project.fps, gapMs);

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

  const last = scenes.at(-1)!;
  console.log(
    `Skeleton built: ${scenes.length} scene(s) from ${cues.length} cue(s) ` +
      `(gap threshold ${gapMs}ms, total ${last.startFrame + last.durationInFrames} frames).`,
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
