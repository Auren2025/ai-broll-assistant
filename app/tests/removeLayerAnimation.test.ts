import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { removeLayerAnimation } from "../src/editor/layerCommands";

function animation(id: string) {
  return {
    id,
    phase: "enter",
    preset: "fade-and-move",
    direction: "left-to-right",
    travelDistance: 100,
    startFrame: 0,
    durationInFrames: 30,
    easing: "ease-out",
  } as const;
}

function exitAnimation(id: string) {
  return {
    id,
    phase: "exit",
    preset: "dissolve",
    startFrame: 30,
    durationInFrames: 15,
    easing: "ease-in",
  } as const;
}

function rect(id: string, animations: unknown[] = [], locked = false) {
  return {
    id,
    name: id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked,
    animations,
    fill: "#ff0000",
    fillEnabled: true,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
    cornerEnabled: true,
    cornerRadius: 0,
    cornerRadii: null,
  } as const;
}

function group(id: string, children: unknown[]) {
  return {
    id,
    name: id,
    type: "group",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children,
  } as const;
}

function sceneWith(...layers: unknown[]): Scene {
  return parseScene({
    schemaVersion: 1,
    id: "scene-001",
    name: "t",
    startFrame: 0,
    durationInFrames: 200,
    layers,
  });
}

function findLayer(scene: Scene, id: string) {
  const layer = scene.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`layer ${id} missing`);
  return layer;
}

test("removes only the targeted animation and keeps the layer", () => {
  const scene = sceneWith(rect("r1", [animation("a1"), exitAnimation("a2")]));
  const updated = removeLayerAnimation(scene, "r1", "a1");
  assert.ok(updated);
  assert.deepEqual(
    findLayer(updated, "r1").animations.map((a) => a.id),
    ["a2"],
  );
  // Original scene untouched.
  assert.deepEqual(
    findLayer(scene, "r1").animations.map((a) => a.id),
    ["a1", "a2"],
  );
});

test("removing the last animation leaves an empty list, not a deleted layer", () => {
  const scene = sceneWith(rect("r1", [animation("a1")]));
  const updated = removeLayerAnimation(scene, "r1", "a1");
  assert.ok(updated);
  assert.deepEqual(findLayer(updated, "r1").animations, []);
});

test("returns null for a stale animation id", () => {
  const scene = sceneWith(rect("r1", [animation("a1")]));
  assert.equal(removeLayerAnimation(scene, "r1", "gone"), null);
});

test("returns null for a missing layer", () => {
  const scene = sceneWith(rect("r1", [animation("a1")]));
  assert.equal(removeLayerAnimation(scene, "nope", "a1"), null);
});

test("returns null for a locked layer", () => {
  const scene = sceneWith(rect("r1", [animation("a1")], true));
  assert.equal(removeLayerAnimation(scene, "r1", "a1"), null);
});

test("returns null for a group member", () => {
  const scene = sceneWith(group("g1", [rect("r1", [animation("a1")])]));
  assert.equal(removeLayerAnimation(scene, "r1", "a1"), null);
});
