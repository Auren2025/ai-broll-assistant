import assert from "node:assert/strict";
import { test } from "node:test";
import type { LayerAnimation } from "../src/domain/layerAnimationSchema";
import { getLayerAnimationStyle } from "../src/remotion/layerAnimationStyle";

const dimensions = { width: 200, height: 100 };

function style(
  animations: readonly LayerAnimation[],
  frame: number,
) {
  return getLayerAnimationStyle(animations, frame, dimensions);
}

function fadeAndMove(
  direction: Extract<LayerAnimation, { preset: "fade-and-move" }>["direction"],
  durationInFrames = 5,
): Extract<LayerAnimation, { preset: "fade-and-move" }> {
  return {
    id: "build-in",
    phase: "enter",
    preset: "fade-and-move",
    startFrame: 10,
    durationInFrames,
    easing: "linear",
    direction,
    travelDistance: 50,
  };
}

const magicMove: Extract<LayerAnimation, { preset: "magic-move" }> = {
  id: "action",
  phase: "emphasis",
  preset: "magic-move",
  startFrame: 20,
  durationInFrames: 5,
  easing: "linear",
  translateX: 120,
  translateY: -60,
  scale: 1.5,
  opacity: 0.4,
};

const dissolve: Extract<LayerAnimation, { preset: "dissolve" }> = {
  id: "build-out",
  phase: "exit",
  preset: "dissolve",
  startFrame: 30,
  durationInFrames: 5,
  easing: "linear",
};

test("Fade and Move combines directional travel with a fade", () => {
  assert.deepEqual(style([fadeAndMove("right-to-left")], 10), {
    opacityMultiplier: 0,
    translateX: 100,
    translateY: 0,
    scale: 1,
  });
  assert.deepEqual(style([fadeAndMove("left-to-right")], 10), {
    opacityMultiplier: 0,
    translateX: -100,
    translateY: 0,
    scale: 1,
  });
  assert.deepEqual(style([fadeAndMove("top-to-bottom")], 10), {
    opacityMultiplier: 0,
    translateX: 0,
    translateY: -50,
    scale: 1,
  });
  assert.deepEqual(style([fadeAndMove("bottom-to-top")], 14), {
    opacityMultiplier: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
  });
});

test("Magic Move reaches and holds its relative target state", () => {
  assert.deepEqual(style([magicMove], 19), {
    opacityMultiplier: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
  });
  assert.deepEqual(style([magicMove], 22), {
    opacityMultiplier: 0.7,
    translateX: 60,
    translateY: -30,
    scale: 1.25,
  });
  assert.deepEqual(style([magicMove], 25), {
    opacityMultiplier: 0.4,
    translateX: 120,
    translateY: -60,
    scale: 1.5,
  });
});

test("Dissolve reaches zero opacity on its final included frame", () => {
  assert.equal(style([dissolve], 29).opacityMultiplier, 1);
  assert.equal(style([dissolve], 30).opacityMultiplier, 1);
  assert.equal(style([dissolve], 34).opacityMultiplier, 0);
  assert.equal(style([dissolve], 35).opacityMultiplier, 0);
});

test("Build In, completed Magic Move, and Build Out compose", () => {
  const result = style([fadeAndMove("right-to-left"), magicMove, dissolve], 32);
  assert.deepEqual(result, {
    opacityMultiplier: 0.2,
    translateX: 120,
    translateY: -60,
    scale: 1.5,
  });
});

test("one-frame animations deterministically use their final state", () => {
  const buildIn = fadeAndMove("bottom-to-top", 1);
  assert.equal(style([buildIn], 9).opacityMultiplier, 0);
  assert.equal(style([buildIn], 10).opacityMultiplier, 1);
  assert.equal(
    style([{ ...dissolve, durationInFrames: 1 }], 30).opacityMultiplier,
    0,
  );
});
