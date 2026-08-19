import { access, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const PROJECTS_ROOT = resolve("projects");

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function scaffold(projectId: string): Promise<void> {
  if (!ID_PATTERN.test(projectId)) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }

  const projectDir = resolve(PROJECTS_ROOT, projectId);

  const projectExists = await exists(projectDir);
  if (projectExists && await exists(resolve(projectDir, "project.json"))) {
    throw new Error(`Project already initialized: ${projectId}`);
  }

  if (projectExists) {
    const existingSceneFiles = await readdir(resolve(projectDir, "scenes"), {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    if (existingSceneFiles.some((entry) => entry.isFile() && entry.name.endsWith(".json"))) {
      throw new Error(
        `Cannot initialize "${projectId}": scenes/ already contains JSON files`,
      );
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

  await mkdir(projectDir, { recursive: true });
  await Promise.all([
    mkdir(resolve(projectDir, "scenes"), { recursive: true }),
    mkdir(resolve(projectDir, "assets"), { recursive: true }),
    mkdir(resolve(projectDir, "audio"), { recursive: true }),
    mkdir(resolve(projectDir, "renders"), { recursive: true }),
  ]);

  const sourcePath = resolve(projectDir, "source.srt");
  if (!await exists(sourcePath)) {
    const rootEntries = await readdir(projectDir, { withFileTypes: true });
    const srtFiles = rootEntries.filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".srt"),
    );
    if (srtFiles.length > 1) {
      throw new Error(
        `Cannot choose source SRT for "${projectId}": found ${srtFiles.length} files`,
      );
    }
    if (srtFiles[0]) {
      await copyFile(resolve(projectDir, srtFiles[0].name), sourcePath);
    } else {
      await writeFile(sourcePath, "", "utf-8");
    }
  }
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

  console.log(`Initialized project "${projectId}" at projects/${projectId}`);
  console.log("Confirm source.srt, review the full narration semantically, then replace");
  console.log("the placeholder scene with the selected B-roll scene plan.");
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
