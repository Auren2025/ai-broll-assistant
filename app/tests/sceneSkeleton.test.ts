import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSceneSkeleton,
  groupCues,
} from "../src/domain/sceneSkeleton";
import { parseScene } from "../src/domain/sceneSchema";
import { validateSceneTimeline } from "../src/domain/timelineValidation";
import type { SubtitleCue } from "../src/domain/subtitleCueSchema";

function cue(
  index: number,
  startMs: number,
  endMs: number,
  text: string,
): SubtitleCue {
  return {
    id: `cue-${String(index).padStart(3, "0")}`,
    index,
    startMs,
    endMs,
    text,
  };
}

const FPS = 30;

test("groupCues splits by gap threshold", () => {
  const cues = [
    cue(1, 0, 1000, "a"),
    cue(2, 1200, 2000, "b"),
    cue(3, 4000, 5000, "c"),
  ];
  const groups = groupCues(cues, 1500);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.length, 2);
  assert.equal(groups[1]?.length, 1);
});

test("buildSceneSkeleton produces a contiguous timeline matching the SRT duration", () => {
  const cues = [
    cue(1, 0, 2500, "第一段"),
    cue(2, 2600, 4000, "第二段"),
    cue(3, 6000, 8000, "第三段"),
  ];
  const scenes = buildSceneSkeleton(cues, FPS, 1500);

  for (const rawScene of scenes) {
    parseScene(rawScene);
  }

  const issues = validateSceneTimeline(scenes, { strict: true });
  assert.deepEqual(issues, [], JSON.stringify(issues));

  assert.equal(scenes[0]?.startFrame, 0);
  const last = scenes.at(-1)!;
  const expectedLastFrame = Math.ceil((8000 * FPS) / 1000);
  assert.equal(last.startFrame + last.durationInFrames, expectedLastFrame);
});

test("buildSceneSkeleton groups cues 1-2 together and keeps them contiguous", () => {
  const cues = [
    cue(1, 0, 2500, "第一段"),
    cue(2, 2600, 4000, "第二段"),
    cue(3, 6000, 8000, "第三段"),
  ];
  const scenes = buildSceneSkeleton(cues, FPS, 1500);
  assert.equal(scenes.length, 2);
  assert.equal(scenes[1]?.startFrame, Math.floor((6000 * FPS) / 1000));
});
