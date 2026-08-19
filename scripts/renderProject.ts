import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  ALPHA_PRORES_RENDER_ARGS,
  buildFinalRenderProps,
} from "../src/remotion/renderPolicy";
import { assertLocalServerIsHealthy } from "./localServerHealth";
import { validateProjectDirectory } from "./projectValidation";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId || !ID_PATTERN.test(projectId)) {
    throw new Error("Usage: npm run render:project -- <project-id>");
  }

  const projectDirectory = resolve("projects", projectId);
  validateProjectDirectory(projectDirectory);
  console.log(`Project preflight passed for "${projectId}".`);
  await assertLocalServerIsHealthy();

  const rendersDir = resolve(projectDirectory, "renders");
  mkdirSync(rendersDir, { recursive: true });
  const result = spawnSync(
    resolve("node_modules", ".bin", "remotion"),
    [
      "render",
      resolve("src/remotion/Studio.tsx"),
      "Video001",
      resolve(rendersDir, `${projectId}.mov`),
      ...ALPHA_PRORES_RENDER_ARGS,
      `--props=${JSON.stringify(buildFinalRenderProps(projectId))}`,
    ],
    { stdio: "inherit" },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
