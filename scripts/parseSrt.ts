import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSrt } from "../src/srt/parseSrt";

function outputParsedSrt(source: string): void {
  const cues = parseSrt(readFileSync(resolve(source), "utf8"));
  const result = {
    source,
    cueCount: cues.length,
    startMs: Math.min(...cues.map((cue) => cue.startMs)),
    endMs: Math.max(...cues.map((cue) => cue.endMs)),
    cues,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const source = process.argv[2];

if (!source) {
  console.error("Usage: tsx scripts/parseSrt.ts <srt-file>");
  process.exitCode = 1;
} else {
  try {
    outputParsedSrt(source);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
