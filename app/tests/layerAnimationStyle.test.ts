import assert from "node:assert/strict";
import { test } from "node:test";
import type { LayerAnimation } from "../src/domain/layerAnimationSchema";
import { getLayerAnimationStyle } from "../src/remotion/layerAnimationStyle";

function animation(
  phase: LayerAnimation["phase"],
  startFrame: number,
  durationInFrames: number,
): LayerAnimation {
  return {
    id: `${phase}-animation`,
    phase,
    preset: "fade",
    startFrame,
    durationInFrames,
    easing: "linear",
  };
}

test("enter animation reaches its final state on the last included frame", () => {
  const entry = animation("enter", 10, 4);
  assert.equal(getLayerAnimationStyle([entry], 9).opacityMultiplier, 0);
  assert.equal(getLayerAnimationStyle([entry], 10).opacityMultiplier, 0);
  assert.equal(getLayerAnimationStyle([entry], 13).opacityMultiplier, 1);
  assert.equal(getLayerAnimationStyle([entry], 14).opacityMultiplier, 1);
});

test("exit animation reaches its final state on the last included frame", () => {
  const exit = animation("exit", 10, 4);
  assert.equal(getLayerAnimationStyle([exit], 9).opacityMultiplier, 1);
  assert.equal(getLayerAnimationStyle([exit], 10).opacityMultiplier, 1);
  assert.equal(getLayerAnimationStyle([exit], 13).opacityMultiplier, 0);
  assert.equal(getLayerAnimationStyle([exit], 14).opacityMultiplier, 0);
});

test("one-frame animations deterministically use their final state", () => {
  assert.equal(
    getLayerAnimationStyle([animation("enter", 10, 1)], 9).opacityMultiplier,
    0,
  );
  assert.equal(
    getLayerAnimationStyle([animation("enter", 10, 1)], 10).opacityMultiplier,
    1,
  );
  assert.equal(
    getLayerAnimationStyle([animation("exit", 10, 1)], 10).opacityMultiplier,
    0,
  );
  assert.equal(
    getLayerAnimationStyle([animation("exit", 10, 1)], 9).opacityMultiplier,
    1,
  );
  assert.equal(
    getLayerAnimationStyle([animation("exit", 10, 1)], 11).opacityMultiplier,
    0,
  );
});
