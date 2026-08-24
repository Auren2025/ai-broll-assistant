import { parseScene, type Scene } from "./sceneSchema";
import type { SubtitleCue } from "./subtitleCueSchema";

export const DEFAULT_GAP_MS = 1500;
export const MIN_SCENE_FRAMES = 30;

function frameFromMs(ms: number, fps: number, mode: "floor" | "ceil"): number {
  return mode === "floor"
    ? Math.floor((ms * fps) / 1000)
    : Math.ceil((ms * fps) / 1000);
}

export function groupCues(
  cues: readonly SubtitleCue[],
  gapMs: number,
): SubtitleCue[][] {
  const groups: SubtitleCue[][] = [];

  for (const cue of cues) {
    const current = groups.at(-1);
    const previous = current?.[current.length - 1];

    if (current && previous && cue.startMs - previous.endMs < gapMs) {
      current.push(cue);
    } else {
      groups.push([cue]);
    }
  }

  return groups;
}

/**
 * Builds a contiguous, non-overlapping scene skeleton from subtitle cues.
 * Each scene's startFrame is an absolute audio anchor (its first cue's start,
 * except scene-001 which always starts at 0). Each scene's duration spans until
 * the next scene's anchor, absorbing trailing silence; the last scene ends at the
 * final cue's end, so the total timeline equals the SRT duration.
 */
export function buildSceneSkeleton(
  cues: readonly SubtitleCue[],
  fps: number,
  gapMs: number,
): Scene[] {
  const groups = groupCues(cues, gapMs);

  const groupStarts = groups.map(
    (group) => frameFromMs(group[0].startMs, fps, "floor"),
  );
  const groupEnds = groups.map(
    (group) => frameFromMs(group[group.length - 1].endMs, fps, "ceil"),
  );

  return groups.map((group, index) => {
    const startFrame = index === 0 ? 0 : groupStarts[index];
    const nextStart =
      index < groups.length - 1 ? groupStarts[index + 1] : groupEnds[index];
    const durationInFrames = Math.max(MIN_SCENE_FRAMES, nextStart - startFrame);
    const firstLine = group[0].text.split("\n")[0].trim();
    const topic = firstLine.slice(0, 60) || `Scene ${index + 1}`;

    return parseScene({
      schemaVersion: 1,
      id: `scene-${String(index + 1).padStart(3, "0")}`,
      topic,
      startFrame,
      durationInFrames,
      layers: [],
    });
  });
}
