import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSrt } from "../src/srt/parseSrt";

function validateSrt(filePath: string): void {
  const absoluteFilePath = resolve(filePath);
  const cues = parseSrt(readFileSync(absoluteFilePath, "utf8"));
  const startMs = Math.min(...cues.map((cue) => cue.startMs));
  const endMs = Math.max(...cues.map((cue) => cue.endMs));

  console.log(
    `SRT is valid: ${cues.length} cue(s), time range ${startMs}ms-${endMs}ms ` +
      `(${((endMs - startMs) / 1_000).toFixed(3)}s).`,
  );
}

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npm run validate:srt -- projects/<project-id>/source.srt");
  process.exitCode = 1;
} else {
  try {
    validateSrt(filePath);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
