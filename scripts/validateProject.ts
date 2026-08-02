import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function validateProject(projectDirectory: string): void {
  const absoluteProjectDirectory = resolve(projectDirectory);
  const projectFile = resolve(absoluteProjectDirectory, "project.json");

  const project = parseProject(readJson(projectFile));

  for (const sceneReference of project.scenes) {
    const sceneFile = resolve(absoluteProjectDirectory, sceneReference.file);

    const scene = parseScene(readJson(sceneFile));

    if (scene.id !== sceneReference.id) {
      throw new Error(
        `Scene id mismatch: project.json references "${sceneReference.id}", ` +
          `but ${sceneReference.file} contains "${scene.id}"`,
      );
    }
  }

  console.log(
    `Project "${project.id}" is valid: ${project.scenes.length} scene(s) checked.`,
  );
}

const projectDirectory = process.argv[2] ?? "projects/video001";

try {
  validateProject(projectDirectory);
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
