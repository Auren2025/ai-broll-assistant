import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sourceEndFrame,
  sourceStartFrame,
  validateScenesAgainstSource,
} from "../src/domain/sourceTimelineValidation";
import type { SubtitleCue } from "../src/domain/subtitleCueSchema";

const cues: SubtitleCue[] = [
  { id: "cue-001", index: 1, startMs: 34, endMs: 1001, text: "One" },
  { id: "cue-002", index: 2, startMs: 1501, endMs: 2001, text: "Two" },
];

test("source frame conversion uses floor for starts and ceil for duration", () => {
  assert.equal(sourceStartFrame(34, 30), 1);
  assert.equal(sourceEndFrame(2001, 30), 61);
});

test("source validation allows transparent gaps and cue-aligned scenes", () => {
  const issues = validateScenesAgainstSource(
    [
      { id: "a", startFrame: 1, durationInFrames: 10 },
      { id: "b", startFrame: 45, durationInFrames: 16 },
    ],
    cues,
    30,
  );
  assert.deepEqual(issues, []);
});

test("source validation rejects non-cue starts and scenes past SRT duration", () => {
  const issues = validateScenesAgainstSource(
    [{ id: "bad", startFrame: 2, durationInFrames: 60 }],
    cues,
    30,
  );
  assert.ok(issues.some((issue) => /cue start boundary/i.test(issue.message)));
  assert.ok(issues.some((issue) => /past source SRT duration/i.test(issue.message)));
});
