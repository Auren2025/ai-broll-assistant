import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseProject, type Project } from "../src/domain/projectSchema";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { validateScenesAgainstSource } from "../src/domain/sourceTimelineValidation";
import {
  summarizeTimelineIssues,
  validateSceneTimeline,
  type TimelineIssue,
} from "../src/domain/timelineValidation";
import { parseSrt } from "../src/srt/parseSrt";

export interface ProjectValidationResult {
  project: Project;
  scenes: Scene[];
  issues: TimelineIssue[];
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function assertFileExists(filePath: string, description: string): void {
  if (!existsSync(filePath)) throw new Error(`${description} is missing`);
}

export function validateProjectDirectory(
  projectDirectory: string,
  options: { strict?: boolean } = {},
): ProjectValidationResult {
  const absoluteProjectDirectory = resolve(projectDirectory);
  const project = parseProject(
    readJson(resolve(absoluteProjectDirectory, "project.json")),
  );

  if (project.audioFile) {
    assertFileExists(
      resolve(absoluteProjectDirectory, project.audioFile),
      `Audio file "${project.audioFile}" referenced by project.json`,
    );
  }

  const scenes = project.scenes.map((sceneReference) => {
    const scene = parseScene(
      readJson(resolve(absoluteProjectDirectory, sceneReference.file)),
    );
    if (scene.id !== sceneReference.id) {
      throw new Error(
        `Scene id mismatch: project.json references "${sceneReference.id}", ` +
          `but ${sceneReference.file} contains "${scene.id}"`,
      );
    }

    for (const layer of scene.layers) {
      const candidates = layer.type === "group" ? layer.children : [layer];
      for (const candidate of candidates) {
        if (candidate.type !== "image" || candidate.src === null) continue;
        const assetFile = resolve(absoluteProjectDirectory, candidate.src);
        const assetRelativePath = relative(absoluteProjectDirectory, assetFile);
        if (
          assetRelativePath === ".." ||
          assetRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
        ) {
          throw new Error(
            `Image asset "${candidate.src}" resolves outside the project`,
          );
        }
        assertFileExists(
          assetFile,
          `Image asset "${candidate.src}" referenced by scene "${scene.id}"`,
        );
      }
    }
    return scene;
  });

  const issues = validateSceneTimeline(scenes, { strict: options.strict });
  const sourceFile = resolve(absoluteProjectDirectory, "source.srt");
  assertFileExists(sourceFile, "Project source.srt");
  const cues = parseSrt(readFileSync(sourceFile, "utf8"));
  issues.push(...validateScenesAgainstSource(scenes, cues, project.fps));

  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `${errors.length} project validation error(s):\n${summarizeTimelineIssues(errors).join("\n")}`,
    );
  }

  return { project, scenes, issues };
}
