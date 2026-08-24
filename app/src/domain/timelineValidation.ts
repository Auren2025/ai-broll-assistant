export type TimelineIssueSeverity = "error" | "warning";

export interface TimelineIssue {
  severity: TimelineIssueSeverity;
  message: string;
}

export interface TimelineScene {
  id: string;
  startFrame: number;
  durationInFrames: number;
}

/**
 * Validates the project-level scene timeline rules from AGENTS.md §5:
 * - The project contains at least one scene (error).
 * - Scenes are ordered by increasing startFrame (error).
 * - Scenes never overlap: each scene starts at or after the previous scene's end
 *   frame (error on overlap). Overlap is always a data error and must be rejected.
 * - Leading and internal gaps are allowed (warning): uncovered frames remain
 *   transparent while narration or source footage continues.
 *
 * `strict` additionally treats gaps as errors for the optional contiguous
 * coverage diagnostic. Routine B-roll project validation should allow gaps.
 */
export function validateSceneTimeline(
  scenes: readonly TimelineScene[],
  options: { strict?: boolean } = {},
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];

  if (scenes.length === 0) {
    issues.push({
      severity: "error",
      message: "Project must contain at least one scene",
    });
    return issues;
  }

  if (scenes[0] && scenes[0].startFrame > 0) {
    issues.push({
      severity: options.strict ? "error" : "warning",
      message:
        `First scene "${scenes[0].id}" starts at frame ${scenes[0].startFrame}; ` +
        `the leading ${scenes[0].startFrame} frame(s) remain transparent.`,
    });
  }

  for (let index = 1; index < scenes.length; index++) {
    const previous = scenes[index - 1];
    const current = scenes[index];
    const previousEnd = previous.startFrame + previous.durationInFrames;

    if (current.startFrame < previous.startFrame) {
      issues.push({
        severity: "error",
        message:
          `Scene "${current.id}" (frame ${current.startFrame}) is out of order; ` +
          `scenes must follow the reference order with increasing startFrame`,
      });
      continue;
    }

    if (current.startFrame < previousEnd) {
      issues.push({
        severity: "error",
        message:
          `Scene "${current.id}" starts at frame ${current.startFrame}, which ` +
          `overlaps scene "${previous.id}" ending at frame ${previousEnd}. ` +
          `Overlap is invalid; shrink the previous scene or move the anchor.`,
      });
    } else if (current.startFrame > previousEnd) {
      const message =
        `Scene "${current.id}" starts at frame ${current.startFrame}, ` +
        `${current.startFrame - previousEnd} frame(s) after scene "${previous.id}" ` +
        `ends at frame ${previousEnd}; the timeline is not contiguous.`;
      issues.push({
        severity: options.strict ? "error" : "warning",
        message,
      });
    }
  }

  return issues;
}

export function summarizeTimelineIssues(issues: readonly TimelineIssue[]): string[] {
  return issues.map((issue) => `[${issue.severity}] ${issue.message}`);
}
