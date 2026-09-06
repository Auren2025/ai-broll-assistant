import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAssetUrl } from "../src/assetUrl";
import type { AnimationPreset } from "../src/domain/layerAnimationSchema";
import { parseScene } from "../src/domain/sceneSchema";
import {
  createDefaultAnimation,
  getAnimationPhase,
  getAnimationPresetLabel,
  getAnimationPresets,
} from "../src/editor/animationCatalog";

function rectangle(stroke: string | null) {
  return parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "Animation catalog",
    startFrame: 0,
    durationInFrames: 120,
    layers: [
      {
        id: "rectangle-1",
        name: "Rectangle",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        opacityEnabled: true,
        blendMode: "normal",
        zIndex: 0,
        visible: true,
        locked: false,
        animations: [],
        fill: "#ffffff",
        fillEnabled: true,
        stroke,
        strokeWidth: stroke ? 2 : 0,
        strokePosition: "inside",
        cornerEnabled: true,
        cornerRadius: 0,
        cornerRadii: null,
      },
    ],
  }).layers[0]!;
}

test("animation catalog keeps labels and phases in one exhaustive mapping", () => {
  const expected = {
    "fade-and-move": ["Fade and Move", "enter"],
    "line-draw": ["Line Draw", "enter"],
    wipe: ["Wipe", "enter"],
    "dissolve-in": ["Dissolve", "enter"],
    "scale-in": ["Scale", "enter"],
    "scale-big": ["Scale Big", "enter"],
    "magic-move": ["Magic Move", "emphasis"],
    dissolve: ["Dissolve", "exit"],
  } as const satisfies Record<AnimationPreset, readonly [string, string]>;

  for (const [preset, [label, phase]] of Object.entries(expected)) {
    assert.equal(getAnimationPresetLabel(preset as AnimationPreset), label);
    assert.equal(getAnimationPhase(preset as AnimationPreset), phase);
  }
});

test("animation catalog exposes Line Draw only for eligible layers", () => {
  const eligiblePresets = getAnimationPresets(rectangle("#000000"), "enter");
  const ineligiblePresets = getAnimationPresets(rectangle(null), "enter");

  assert(eligiblePresets.some(({ preset }) => preset === "line-draw"));
  assert(!ineligiblePresets.some(({ preset }) => preset === "line-draw"));
});

test("default animation construction preserves phase timing rules", () => {
  const layer = rectangle("#000000");
  const enter = createDefaultAnimation(layer, "fade-and-move", 120, 30);
  const action = createDefaultAnimation(layer, "magic-move", 120, 30);
  const exit = createDefaultAnimation(layer, "dissolve", 120, 30);

  assert.deepEqual(
    [enter.phase, enter.startFrame, action.phase, action.startFrame, exit.phase, exit.startFrame],
    ["enter", 0, "emphasis", 45, "exit", 90],
  );
});

test("asset URL resolution is transport agnostic", () => {
  assert.equal(
    resolveAssetUrl("http://127.0.0.1:3002/api/projects/demo/", "assets/image.png"),
    "http://127.0.0.1:3002/api/projects/demo/assets/image.png",
  );
  assert.equal(resolveAssetUrl(".", "assets/image.png"), "./assets/image.png");
});
