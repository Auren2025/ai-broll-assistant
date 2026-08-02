import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const projectId = process.argv[2];

if (!projectId || !ID_PATTERN.test(projectId)) {
  console.error("Usage: npm run render:project -- <project-id>");
  process.exitCode = 1;
} else {
  const rendersDir = resolve("projects", projectId, "renders");
  mkdirSync(rendersDir, { recursive: true });

  const bin = resolve("node_modules", ".bin", "remotion");
  const output = resolve(rendersDir, `${projectId}.mov`);
  const props = JSON.stringify({ projectId });

  const result = spawnSync(
    bin,
    [
      "render",
      resolve("src/remotion/Studio.tsx"),
      "Video001",
      output,
      "--image-format=png",
      "--pixel-format=yuva444p10le",
      "--codec=prores",
      "--prores-profile=4444",
      `--props=${props}`,
    ],
    { stdio: "inherit" },
  );

  process.exitCode = result.status ?? 1;
}
