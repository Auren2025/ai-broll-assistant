import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProject } from "../src/domain/projectSchema";
import { DEFAULT_GAP_MS, groupCues } from "../src/domain/sceneSkeleton";
import {
  sourceEndFrame,
  sourceStartFrame,
} from "../src/domain/sourceTimelineValidation";
import { parseSrt } from "../src/srt/parseSrt";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

async function printCandidates(projectId: string, gapMs: number): Promise<void> {
  if (!ID_PATTERN.test(projectId)) throw new Error(`Invalid project id: "${projectId}"`);
  const projectDir = resolve("projects", projectId);
  const project = parseProject(
    JSON.parse(await readFile(resolve(projectDir, "project.json"), "utf8")),
  );
  const cues = parseSrt(await readFile(resolve(projectDir, "source.srt"), "utf8"));
  const groups = groupCues(cues, gapMs);

  console.log(
    `Candidate-only pause groups: ${groups.length} from ${cues.length} cue(s) ` +
      `(gap threshold ${gapMs}ms). No project files were changed.`,
  );
  groups.forEach((group, index) => {
    const cueRange = `${group[0].index}-${group.at(-1)!.index}`;
    const startFrame = sourceStartFrame(group[0].startMs, project.fps);
    const endFrame = sourceEndFrame(group.at(-1)!.endMs, project.fps);
    console.log(
      `  candidate ${index + 1}: cues ${cueRange}, anchor frame ` +
        `${startFrame}, suggested end frame ${endFrame}`,
    );
  });
  console.log(
    "These pause-based groups are planning aids only. Read the complete SRT, " +
      "propose semantic scenes in the conversation, and obtain approval before writing JSON.",
  );
}

const projectId = process.argv[2];
const gapArg = process.argv[3];
const gapMs =
  gapArg && !Number.isNaN(Number(gapArg))
    ? Math.max(100, Number(gapArg))
    : DEFAULT_GAP_MS;

if (!projectId) {
  console.error("Usage: npm run skeleton -- <project-id> [gap-ms]");
  process.exitCode = 1;
} else {
  printCandidates(projectId, gapMs).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
