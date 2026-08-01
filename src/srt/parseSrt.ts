import {
  SubtitleCueListSchema,
  SubtitleCueSchema,
  type SubtitleCue,
} from "../domain/subtitleCueSchema";

const TIMESTAMP_PATTERN = /^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/;
const TIMING_PATTERN = /^(.+?)\s+-->\s+(.+)$/;

function parseTimestamp(value: string, blockPosition: number): number {
  const match = TIMESTAMP_PATTERN.exec(value);

  if (!match) {
    throw new Error(
      `SRT block ${blockPosition}: invalid timestamp format "${value}"`,
    );
  }

  const [, hours, minutes, seconds, milliseconds] = match;

  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(milliseconds)
  );
}

function parseBlock(block: string, blockPosition: number): SubtitleCue {
  const lines = block.split("\n");
  const indexSource = lines[0]?.trim() ?? "";

  if (!/^\d+$/.test(indexSource) || Number(indexSource) < 1) {
    throw new Error(
      `SRT block ${blockPosition}: cue index must be a positive integer`,
    );
  }

  const index = Number(indexSource);
  const timingSource = lines[1]?.trim() ?? "";
  const timingMatch = TIMING_PATTERN.exec(timingSource);

  if (!timingMatch) {
    throw new Error(
      `SRT block ${blockPosition} (cue ${index}): invalid timing format`,
    );
  }

  const startMs = parseTimestamp(timingMatch[1], blockPosition);
  const endMs = parseTimestamp(timingMatch[2], blockPosition);
  const text = lines.slice(2).join("\n").trim();
  const cue = {
    id: `cue-${String(index).padStart(3, "0")}`,
    index,
    startMs,
    endMs,
    text,
  };
  const result = SubtitleCueSchema.safeParse(cue);

  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`SRT block ${blockPosition} (cue ${index}): ${details}`);
  }

  return result.data;
}

export function parseSrt(source: string): SubtitleCue[] {
  const normalizedSource = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalizedSource) {
    throw new Error("SRT position 1: no subtitle blocks found");
  }

  const blocks = normalizedSource.split(/\n[\t ]*\n+/);
  const cues = blocks.map((block, index) => parseBlock(block, index + 1));
  const result = SubtitleCueListSchema.safeParse(cues);

  if (!result.success) {
    const issue = result.error.issues[0];
    const blockPosition =
      typeof issue?.path[0] === "number" ? issue.path[0] + 1 : 1;
    throw new Error(`SRT block ${blockPosition}: ${issue?.message}`);
  }

  return result.data;
}
