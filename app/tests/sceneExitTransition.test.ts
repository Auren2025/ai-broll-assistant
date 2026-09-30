import { test } from "node:test";
import assert from "node:assert/strict";
import { getExitTransitionOpacity } from "../src/remotion/sceneExitTransition";

test("exit transition opacity stays at 1 before the outro starts", () => {
  assert.equal(getExitTransitionOpacity(0, 100, 15), 1);
  assert.equal(getExitTransitionOpacity(84, 100, 15), 1);
  assert.equal(getExitTransitionOpacity(85, 100, 15), 1);
});

test("exit transition opacity ramps linearly to 0 on the last frame", () => {
  // 10-frame outro over a 100-frame scene: frames 91..99 fade, frame 90 is full.
  assert.equal(getExitTransitionOpacity(90, 100, 10), 1);
  assert.equal(getExitTransitionOpacity(91, 100, 10), 1 - 1 / 9);
  assert.equal(getExitTransitionOpacity(95, 100, 10), 1 - 5 / 9);
  assert.equal(getExitTransitionOpacity(99, 100, 10), 0);
  assert.equal(getExitTransitionOpacity(100, 100, 10), 0);
  assert.equal(getExitTransitionOpacity(120, 100, 10), 0);
});

test("exit transition clamps an outro longer than the scene", () => {
  assert.equal(getExitTransitionOpacity(0, 100, 200), 1);
  assert.equal(getExitTransitionOpacity(50, 100, 200), 1 - 50 / 99);
  assert.equal(getExitTransitionOpacity(99, 100, 200), 0);
});

test("a zero or negative outro duration disables the fade", () => {
  assert.equal(getExitTransitionOpacity(99, 100, 0), 1);
  assert.equal(getExitTransitionOpacity(99, 100, -3), 1);
});
