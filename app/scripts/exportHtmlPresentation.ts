import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { parseProject } from "../src/domain/projectSchema";
import type { Layer } from "../src/domain/sceneSchema";
import { validateSceneTimeline } from "../src/domain/timelineValidation";
import { parsePresentationData } from "../src/presentation/presentationData";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function collectImageSources(layers: readonly Layer[]): string[] {
  const sources: string[] = [];

  for (const layer of layers) {
    if (layer.type === "image" && layer.src !== null) {
      sources.push(layer.src);
    } else if (layer.type === "group") {
      sources.push(...collectImageSources(layer.children));
    }
  }

  return sources;
}

function serializeForScript(input: unknown): string {
  return JSON.stringify(input)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

async function exportHtmlPresentation(projectId: string): Promise<void> {
  if (!ID_PATTERN.test(projectId)) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }

  const repositoryRoot = resolve(".");
  const projectDirectory = resolve(repositoryRoot, "projects", projectId);
  const project = parseProject(
    JSON.parse(
      await readFile(resolve(projectDirectory, "project.json"), "utf-8"),
    ),
  );
  const scenes = await Promise.all(
    project.scenes.map(async (reference: { file: string }) =>
      JSON.parse(
        await readFile(resolve(projectDirectory, reference.file), "utf-8"),
      ),
    ),
  );
  const presentationData = parsePresentationData({ project, scenes });
  const timelineErrors = validateSceneTimeline(presentationData.scenes).filter(
    (issue) => issue.severity === "error",
  );
  if (timelineErrors.length > 0) {
    throw new Error(
      `Invalid presentation timeline:\n${timelineErrors
        .map((issue) => `- ${issue.message}`)
        .join("\n")}`,
    );
  }

  const imageSources = new Set(
    presentationData.scenes.flatMap((scene) =>
      collectImageSources(scene.layers),
    ),
  );
  await Promise.all(
    [...imageSources].map(async (source) => {
      try {
        await access(resolve(projectDirectory, source));
      } catch {
        throw new Error(`Missing presentation asset: ${source}`);
      }
    }),
  );

  const exportsDirectory = resolve(projectDirectory, "exports");
  const outputDirectory = resolve(exportsDirectory, "html");
  const temporaryDirectory = resolve(
    exportsDirectory,
    `.html-export-${process.pid}`,
  );

  await mkdir(exportsDirectory, { recursive: true });
  await rm(temporaryDirectory, { recursive: true, force: true });

  try {
    await build({
      configFile: false,
      publicDir: false,
      plugins: [react()],
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
      },
      build: {
        outDir: temporaryDirectory,
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        lib: {
          entry: resolve(repositoryRoot, "presentation", "main.tsx"),
          name: "AIBrollPresentation",
          formats: ["iife"],
          fileName: () => "presentation.js",
        },
        rollupOptions: {
          output: {
            assetFileNames: (assetInfo) =>
              assetInfo.names.some((name) => name.endsWith(".css"))
                ? "presentation.css"
                : "assets/[name]-[hash][extname]",
          },
        },
      },
    });

    await cp(
      resolve(repositoryRoot, "presentation", "index.html"),
      resolve(temporaryDirectory, "index.html"),
    );
    await writeFile(
      resolve(temporaryDirectory, "presentation-data.js"),
      `globalThis.__AI_BROLL_PRESENTATION__ = ${serializeForScript(presentationData)};\n`,
      "utf-8",
    );

    const assetsDirectory = resolve(projectDirectory, "assets");
    await access(assetsDirectory);
    await cp(assetsDirectory, resolve(temporaryDirectory, "assets"), {
      recursive: true,
    });

    await rm(outputDirectory, { recursive: true, force: true });
    await rename(temporaryDirectory, outputDirectory);
  } catch (error: unknown) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }

  console.log(`Exported HTML presentation for "${projectId}"`);
  console.log(`Open ${resolve(outputDirectory, "index.html")}`);
}

const projectId = process.argv[2];

if (!projectId) {
  console.error("Usage: npm run export:html -- <project-id>");
  process.exitCode = 1;
} else {
  exportHtmlPresentation(projectId).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
