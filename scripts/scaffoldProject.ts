import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROJECTS_ROOT = resolve("projects");

async function scaffold(projectId: string): Promise<void> {
  if (!ID_PATTERN.test(projectId)) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }

  const projectDir = resolve(PROJECTS_ROOT, projectId);

  try {
    await access(projectDir);
    throw new Error(`Project already exists: ${projectId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Project already exists")) {
      throw error;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "Untitled scene 1",
    startFrame: 0,
    durationInFrames: 150,
    layers: [],
  });
  const project = parseProject({
    schemaVersion: 1,
    id: projectId,
    name: projectId,
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: scene.id, file: "scenes/scene-001.json" }],
  });

  await mkdir(projectDir);
  await Promise.all([
    mkdir(resolve(projectDir, "scenes"), { recursive: true }),
    mkdir(resolve(projectDir, "assets"), { recursive: true }),
    mkdir(resolve(projectDir, "audio"), { recursive: true }),
    mkdir(resolve(projectDir, "renders"), { recursive: true }),
  ]);

  await writeFile(resolve(projectDir, "source.srt"), "", "utf-8");
  await writeFile(
    resolve(projectDir, "project.json"),
    `${JSON.stringify(project, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(
    resolve(projectDir, "scenes", "scene-001.json"),
    `${JSON.stringify(scene, null, 2)}\n`,
    "utf-8",
  );

  console.log(`Scaffolded project "${projectId}" at projects/${projectId}`);
  console.log("Place the voiceover into projects/<id>/source.srt, then run:");
  console.log(`  npm run skeleton -- ${projectId}`);
}

const projectId = process.argv[2];

if (!projectId) {
  console.error("Usage: npm run scaffold -- <project-id>");
  process.exitCode = 1;
} else {
  scaffold(projectId).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
