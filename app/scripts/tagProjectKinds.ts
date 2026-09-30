import { constants } from "node:fs";
import { copyFile, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import type { ProjectCategory } from "./projectDirectory";

async function tagProjects(root: string): Promise<void> {
  const pending: { file: string; content: string }[] = [];
  const seen = new Set<string>();

  for (const category of ["broll", "slide"] as const satisfies readonly ProjectCategory[]) {
    const directory = resolve(root, category);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = resolve(directory, entry.name, "project.json");
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const data: unknown = JSON.parse(raw);
      const project = parseProject(data);
      if (project.id !== entry.name || seen.has(project.id)) {
        throw new Error(`Invalid or duplicate project ID at ${file}`);
      }
      seen.add(project.id);
      if (project.kind !== category && (data as { kind?: unknown }).kind !== undefined) {
        throw new Error(`Project kind disagrees with directory: ${file}`);
      }
      if ((data as { kind?: unknown }).kind === undefined) {
        pending.push({ file, content: `${JSON.stringify({ ...project, kind: category }, null, 2)}\n` });
      }
    }
  }

  for (const { file, content } of pending) {
    await copyFile(file, `${file}.before-kind.bak`, constants.COPYFILE_EXCL);
    const temporaryFile = `${file}.kind-tmp-${process.pid}`;
    try {
      await writeFile(temporaryFile, content, { encoding: "utf8", flag: "wx" });
      await rename(temporaryFile, file);
    } catch (error: unknown) {
      await rm(temporaryFile, { force: true });
      throw error;
    }
    console.log(`Tagged ${file}`);
  }
  console.log(`Tagged ${pending.length} project(s).`);
}

tagProjects(resolve("projects")).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
