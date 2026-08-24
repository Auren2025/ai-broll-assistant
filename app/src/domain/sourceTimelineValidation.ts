import type { SubtitleCue } from "./subtitleCueSchema";
import type { TimelineIssue, TimelineScene } from "./timelineValidation";

export function sourceStartFrame(startMs: number, fps: number): number {
  return Math.floor((startMs * fps) / 1000);
}

export function sourceEndFrame(endMs: number, fps: number): number {
  return Math.ceil((endMs * fps) / 1000);
}

export function validateScenesAgainstSource(
  scenes: readonly TimelineScene[],
  cues: readonly SubtitleCue[],
  fps: number,
): TimelineIssue[] {
  if (cues.length === 0) return [];

  const startFrames = new Set(
    cues.map((cue) => sourceStartFrame(cue.startMs, fps)),
  );
  const sourceDuration = sourceEndFrame(
    Math.max(...cues.map((cue) => cue.endMs)),
    fps,
  );
  const issues: TimelineIssue[] = [];

  for (const scene of scenes) {
    if (!startFrames.has(scene.startFrame)) {
      issues.push({
        severity: "error",
        message:
          `Scene "${scene.id}" starts at frame ${scene.startFrame}, which does ` +
          "not align to a source cue start boundary at the project FPS",
      });
    }

    const endFrame = scene.startFrame + scene.durationInFrames;
    if (endFrame > sourceDuration) {
      issues.push({
        severity: "error",
        message:
          `Scene "${scene.id}" ends at frame ${endFrame}, past source SRT ` +
          `duration frame ${sourceDuration}`,
      });
    }
  }

  return issues;
}
