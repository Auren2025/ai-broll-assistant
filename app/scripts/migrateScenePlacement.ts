import { constants } from "node:fs";
import { copyFile, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import type { ProjectCategory } from "./projectDirectory";

async function writeAtomically(file: string, content: string): Promise<void> {
  const temporary = `${file}.placement-tmp-${process.pid}`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } catch (error: unknown) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function migrate(root: string): Promise<void> {
  for (const category of ["broll", "slide"] as const satisfies readonly ProjectCategory[]) {
    const directory = resolve(root, category);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectFile = resolve(directory, entry.name, "project.json");
      let raw: string;
      try {
        raw = await readFile(projectFile, "utf8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const project = parseProject(JSON.parse(raw));
      if (project.id !== entry.name || project.kind !== category) {
        throw new Error(`Project type or ID does not match ${projectFile}`);
      }

      const updatedScenes: { file: string; raw: string; content: string }[] = [];
      const references = await Promise.all(project.scenes.map(async (reference) => {
        const file = resolve(directory, entry.name, reference.file);
        const original = await readFile(file, "utf8");
        const scene = parseScene(JSON.parse(original));
        if (scene.id !== reference.id) throw new Error(`Scene ID mismatch at ${file}`);
        const startFrame = reference.startFrame ?? scene.startFrame;
        if (category === "broll" && startFrame === undefined) {
          throw new Error(`Missing B-roll timeline anchor at ${file}`);
        }
        if (reference.startFrame !== undefined && scene.startFrame !== undefined && reference.startFrame !== scene.startFrame) {
          throw new Error(`Conflicting B-roll timeline anchors at ${file}`);
        }
        if (scene.startFrame !== undefined || scene.schemaVersion !== 2) {
          const { startFrame: _legacy, ...localScene } = scene;
          updatedScenes.push({ file, raw: original, content: `${JSON.stringify(parseScene({ ...localScene, schemaVersion: 2 }), null, 2)}\n` });
        }
        return category === "broll"
          ? { id: reference.id, file: reference.file, startFrame }
          : { id: reference.id, file: reference.file };
      }));
      const updatedProject = parseProject({ ...project, schemaVersion: 2, scenes: references });
      const updatedProjectContent = `${JSON.stringify(updatedProject, null, 2)}\n`;
      if (updatedScenes.length === 0 && raw === updatedProjectContent) continue;

      const changed = [
        ...(raw === updatedProjectContent ? [] : [{ file: projectFile, raw, content: updatedProjectContent }]),
        ...updatedScenes,
      ];
      for (const { file } of changed) {
        await copyFile(file, `${file}.before-v2.bak`, constants.COPYFILE_EXCL);
      }
      try {
        for (const { file, content } of changed) await writeAtomically(file, content);
      } catch (error: unknown) {
        for (const { file, raw: original } of changed) await writeAtomically(file, original);
        throw error;
      }
      console.log(`Migrated ${category}/${entry.name}: ${updatedScenes.length} scene(s)`);
    }
  }
}

migrate(resolve("projects")).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
