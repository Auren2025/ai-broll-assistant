import assert from "node:assert/strict";
import { test } from "node:test";
import type { LayerAnimation } from "../src/domain/layerAnimationSchema";
import {
  getLayerAnimationStyle,
  getLineDrawAnimationState,
  getWipeAnimationState,
} from "../src/remotion/layerAnimationStyle";

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

const lineDraw: Extract<LayerAnimation, { preset: "line-draw" }> = {
  id: "line-draw",
  phase: "enter",
  preset: "line-draw",
  startFrame: 10,
  durationInFrames: 6,
  easing: "linear",
  direction: "clockwise",
};

const dissolveIn: Extract<LayerAnimation, { preset: "dissolve-in" }> = {
  id: "dissolve-in",
  phase: "enter",
  preset: "dissolve-in",
  startFrame: 10,
  durationInFrames: 5,
  easing: "linear",
};

function scaleIn(
  direction: "up" | "down",
  bounce: boolean,
): Extract<LayerAnimation, { preset: "scale-in" }> {
  return {
    id: "scale-in",
    phase: "enter",
    preset: "scale-in",
    startFrame: 10,
    durationInFrames: 5,
    easing: "linear",
    direction,
    bounce,
  };
}

const scaleBig: Extract<LayerAnimation, { preset: "scale-big" }> = {
  id: "scale-big",
  phase: "enter",
  preset: "scale-big",
  startFrame: 10,
  durationInFrames: 5,
  easing: "linear",
};

const wipe: Extract<LayerAnimation, { preset: "wipe" }> = {
  id: "wipe",
  phase: "enter",
  preset: "wipe",
  startFrame: 10,
  durationInFrames: 5,
  easing: "linear",
  direction: "top-left-to-bottom-right",
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

test("Line Draw reaches the full path and fades content in near completion", () => {
  assert.deepEqual(getLineDrawAnimationState([lineDraw], 9), {
    progress: 0,
    contentOpacity: 0,
    direction: "clockwise",
  });
  assert.deepEqual(getLineDrawAnimationState([lineDraw], 14), {
    progress: 0.8,
    contentOpacity: 0,
    direction: "clockwise",
  });
  assert.deepEqual(getLineDrawAnimationState([lineDraw], 15), {
    progress: 1,
    contentOpacity: 1,
    direction: "clockwise",
  });
  assert.equal(getLineDrawAnimationState([], 15), null);
});

test("Dissolve In fades from transparent to fully visible", () => {
  assert.equal(style([dissolveIn], 10).opacityMultiplier, 0);
  assert.equal(style([dissolveIn], 12).opacityMultiplier, 0.5);
  assert.equal(style([dissolveIn], 14).opacityMultiplier, 1);
});

test("Scale supports fixed up, down, and bounce variants", () => {
  assert.deepEqual(style([scaleIn("up", false)], 10), {
    opacityMultiplier: 0,
    translateX: 0,
    translateY: 0,
    scale: 0,
  });
  assert.equal(style([scaleIn("up", false)], 12).scale, 0.5);
  assert.equal(style([scaleIn("down", false)], 10).scale, 1.5);
  assert.equal(style([scaleIn("down", false)], 12).scale, 1.25);
  assert.equal(style([scaleIn("up", true)], 13).scale, 1.08);
  assert.equal(style([scaleIn("down", true)], 13).scale, 0.94);
  assert.equal(style([scaleIn("up", true)], 14).scale, 1);
});

test("Scale Big shrinks from 400 percent and fades in", () => {
  assert.equal(style([scaleBig], 10).scale, 4);
  assert.equal(style([scaleBig], 10).opacityMultiplier, 0);
  assert.equal(style([scaleBig], 12).scale, 2.5);
  assert.equal(style([scaleBig], 14).scale, 1);
  assert.equal(style([scaleBig], 14).opacityMultiplier, 1);
});

test("Build In and Magic Move scales compose multiplicatively", () => {
  const overlappingAction = { ...magicMove, startFrame: 10 };
  assert.equal(style([scaleIn("up", false), overlappingAction], 12).scale, 0.625);
  assert.equal(style([scaleIn("up", false), overlappingAction], 15).scale, 1.5);
});

test("Wipe exposes eased progress and direction without changing layer style", () => {
  assert.deepEqual(getWipeAnimationState([wipe], 12), {
    progress: 0.5,
    direction: "top-left-to-bottom-right",
  });
  assert.deepEqual(style([wipe], 12), {
    opacityMultiplier: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
  });
});
