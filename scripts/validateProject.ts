import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import {
  summarizeTimelineIssues,
  validateSceneTimeline,
} from "../src/domain/timelineValidation";

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function validateProject(projectDirectory: string, strict: boolean): void {
  const absoluteProjectDirectory = resolve(projectDirectory);
  const projectFile = resolve(absoluteProjectDirectory, "project.json");

  const project = parseProject(readJson(projectFile));
  const scenes = project.scenes.map((sceneReference) => {
    const sceneFile = resolve(absoluteProjectDirectory, sceneReference.file);
    const scene = parseScene(readJson(sceneFile));

    if (scene.id !== sceneReference.id) {
      throw new Error(
        `Scene id mismatch: project.json references "${sceneReference.id}", ` +
          `but ${sceneReference.file} contains "${scene.id}"`,
      );
    }

    if (project.audioFile) {
      const audioFile = resolve(absoluteProjectDirectory, project.audioFile);
      try {
        readFileSync(audioFile);
      } catch {
        throw new Error(
          `Audio file "${project.audioFile}" referenced by project.json is missing`,
        );
      }
    }

    return scene;
  });

  const timelineIssues = validateSceneTimeline(scenes, { strict });
  const lines = summarizeTimelineIssues(timelineIssues);

  if (lines.length > 0) {
    console.log(`Timeline check for "${project.id}":`);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
  }

  const errors = timelineIssues.filter((issue) => issue.severity === "error");
  const warnings = timelineIssues.filter((issue) => issue.severity === "warning");

  if (errors.length > 0) {
    throw new Error(`${errors.length} timeline error(s) found`);
  }

  const warningNote = warnings.length > 0 ? ` (${warnings.length} gap warning(s))` : "";
  console.log(
    `Project "${project.id}" is valid: ${project.scenes.length} scene(s) checked${warningNote}.`,
  );
}

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const projectDirectory =
  args.find((argument) => !argument.startsWith("--")) ?? "projects/video001";

try {
  validateProject(projectDirectory, strict);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
