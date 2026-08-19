import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSceneTimeline } from "../src/domain/timelineValidation";

function scene(id: string, startFrame: number, durationInFrames: number) {
  return { id, startFrame, durationInFrames };
}

test("empty scene list is an error", () => {
  const issues = validateSceneTimeline([]);
  assert.ok(issues.some((i) => i.severity === "error"));
});

test("contiguous timeline has no issues", () => {
  const issues = validateSceneTimeline([
    scene("a", 0, 100),
    scene("b", 100, 100),
    scene("c", 200, 50),
  ]);
  assert.deepEqual(issues, []);
});

test("leading gap is a warning by default and an error in strict mode", () => {
  const timeline = [scene("a", 30, 100)];
  const defaultIssues = validateSceneTimeline(timeline);
  const strictIssues = validateSceneTimeline(timeline, { strict: true });
  assert.ok(defaultIssues.some((i) => i.severity === "warning" && /transparent/i.test(i.message)));
  assert.ok(strictIssues.some((i) => i.severity === "error" && /transparent/i.test(i.message)));
});

test("overlap is an error", () => {
  const issues = validateSceneTimeline([
    scene("a", 0, 100),
    scene("b", 90, 100),
  ]);
  assert.ok(issues.some((i) => i.severity === "error" && /overlap/i.test(i.message)));
});

test("gap is a warning by default and an error in strict mode", () => {
  const timeline = [scene("a", 0, 100), scene("b", 150, 100)];
  const defaultIssues = validateSceneTimeline(timeline);
  const strictIssues = validateSceneTimeline(timeline, { strict: true });
  assert.ok(
    defaultIssues.some((i) => i.severity === "warning" && /not contiguous/i.test(i.message)),
  );
  assert.ok(strictIssues.some((i) => i.severity === "error" && /not contiguous/i.test(i.message)));
});

test("out-of-order scenes are an error", () => {
  const issues = validateSceneTimeline([
    scene("a", 200, 100),
    scene("b", 100, 100),
  ]);
  assert.ok(issues.some((i) => i.severity === "error" && /out of order/i.test(i.message)));
});
