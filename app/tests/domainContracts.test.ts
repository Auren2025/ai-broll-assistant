import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import {
  deleteLayers,
  findParentGroup,
  isEffectivelyLocked,
  makeGroup,
  moveLayerTo,
  reorderSelectedLayersZIndex,
} from "../src/domain/groupOperations";
import { alignSceneLayers } from "../src/editor/alignment";

function rect(id: string, x: number, y: number, zIndex: number) {
  return {
    id,
    name: id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
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

function groupScene(): Scene {
  const base = sceneWith(rect("a", 0, 0, 0), rect("b", 200, 0, 1));
  const grouped = makeGroup(base, ["a", "b"], "group-1", "Group 1");
  assert.ok(grouped);
  return grouped;
}

function groupOf(scene: Scene) {
  const group = scene.layers.find((layer) => layer.id === "group-1");
  assert.ok(group?.type === "group");
  return group;
}

// --- findParentGroup / isEffectivelyLocked ---

test("findParentGroup locates the containing group", () => {
  const scene = groupScene();
  assert.equal(findParentGroup(scene.layers, "a")?.id, "group-1");
  assert.equal(findParentGroup(scene.layers, "group-1"), null);
  assert.equal(findParentGroup(scene.layers, "missing"), null);
});

test("isEffectivelyLocked covers self lock and group lock", () => {
  const locked = { ...rect("locked", 0, 0, 0), locked: true };
  const scene = sceneWith(locked, rect("free", 200, 0, 1));
  assert.equal(isEffectivelyLocked(scene.layers, "locked"), true);
  assert.equal(isEffectivelyLocked(scene.layers, "free"), false);
  assert.equal(isEffectivelyLocked(scene.layers, "missing"), false);

  const grouped = groupScene();
  assert.equal(isEffectivelyLocked(grouped.layers, "a"), false);
  const lockedGroup = {
    ...groupOf(grouped),
    locked: true,
  };
  const lockedScene = sceneWith(lockedGroup);
  assert.equal(isEffectivelyLocked(lockedScene.layers, "a"), true);
});

// --- deleteLayers ---

test("deleteLayers with empty or stale selection returns the original scene", () => {
  const scene = groupScene();
  assert.equal(deleteLayers(scene, []), scene);
  assert.equal(deleteLayers(scene, ["missing"]), scene);
});

test("deleteLayers hugs the group frame after removing a child", () => {
  const scene = groupScene();
  const next = deleteLayers(scene, ["b"]);
  assert.notEqual(next, scene);
  const group = groupOf(next);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0]?.id, "a");
  // Frame shrinks to the remaining child: x=0, width=100.
  assert.equal(group.x, 0);
  assert.equal(group.width, 100);
  assert.equal(group.children[0]?.x, 0);
  parseScene(next);
});

test("deleteLayers removes a group left with no children", () => {
  const scene = groupScene();
  const next = deleteLayers(scene, ["a", "b"]);
  assert.notEqual(next, scene);
  assert.equal(next.layers.length, 0);
});

// --- reorderSelectedLayersZIndex ---

test("reorder at the edge is a no-op returning the original scene", () => {
  const scene = sceneWith(rect("a", 0, 0, 0), rect("b", 200, 0, 1));
  assert.equal(reorderSelectedLayersZIndex(scene, ["b"], "front"), scene);
  assert.equal(reorderSelectedLayersZIndex(scene, ["a"], "back"), scene);
});

test("reorder away from the edge still changes the scene", () => {
  const scene = sceneWith(rect("a", 0, 0, 0), rect("b", 200, 0, 1));
  const next = reorderSelectedLayersZIndex(scene, ["a"], "front");
  assert.notEqual(next, scene);
  assert.deepEqual(
    next.layers.map((layer) => layer.id),
    ["b", "a"],
  );
});

// --- moveLayerTo ---

test("moveLayerTo dropping back at its own position is a no-op", () => {
  const scene = sceneWith(
    rect("a", 0, 0, 0),
    rect("b", 200, 0, 1),
    rect("c", 400, 0, 2),
  );
  const next = moveLayerTo(scene, "b", {
    parentGroupId: null,
    beforeLayerId: "a",
  });
  assert.ok(next);
  assert.equal(next, scene);
});

test("moveLayerTo out of a group hugs the source frame and clears animations", () => {
  const animation = {
    id: "enter-1",
    phase: "enter",
    preset: "fade-and-move",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
    direction: "bottom-to-top",
    travelDistance: 0,
  } as const;
  const base = sceneWith(
    { ...rect("a", 0, 0, 0), animations: [animation] },
    { ...rect("b", 200, 0, 1), animations: [animation] },
  );
  const grouped = makeGroup(base, ["a", "b"], "group-1", "Group 1");
  assert.ok(grouped);

  const next = moveLayerTo(grouped, "b", {
    parentGroupId: null,
    beforeLayerId: null,
  });
  assert.ok(next);
  assert.notEqual(next, grouped);
  const group = groupOf(next);
  assert.equal(group.children.length, 1);
  assert.equal(group.width, 100);
  const moved = next.layers.find((layer) => layer.id === "b");
  assert.ok(moved);
  assert.deepEqual(moved.animations, []);
  parseScene(next);
});

test("moveLayerTo into a group grows the target frame to include the layer", () => {
  const grouped = groupScene();
  const withExtra = sceneWith(...grouped.layers, rect("extra", 500, 0, 1));

  const next = moveLayerTo(withExtra, "extra", {
    parentGroupId: "group-1",
    beforeLayerId: null,
  });
  assert.ok(next);
  const group = groupOf(next);
  assert.equal(group.children.length, 3);
  // Union of 0..100 and 500..600.
  assert.equal(group.width, 600);
  const added = group.children.find((child) => child.id === "extra");
  assert.ok(added);
  assert.equal(added.x, 500);
  parseScene(next);
});

// --- alignSceneLayers lock filtering ---

test("alignSceneLayers skips locked layers", () => {
  const locked = { ...rect("locked", 500, 0, 2), locked: true };
  const scene = sceneWith(rect("u1", 100, 0, 0), rect("u2", 300, 0, 1), locked);
  const next = alignSceneLayers(
    scene,
    ["u1", "u2", "locked"],
    "left",
    1920,
    1080,
  );
  assert.notEqual(next, scene);
  const after = Object.fromEntries(next.layers.map((layer) => [layer.id, layer]));
  assert.equal(after["u1"]?.x, 100);
  assert.equal(after["u2"]?.x, 100);
  assert.equal(after["locked"]?.x, 500);
});

test("alignSceneLayers with only locked selected is a no-op", () => {
  const locked = { ...rect("locked", 500, 0, 0), locked: true };
  const scene = sceneWith(locked, rect("u1", 100, 0, 1));
  const next = alignSceneLayers(scene, ["locked"], "horizontal-center", 1920, 1080);
  assert.equal(next, scene);
});
