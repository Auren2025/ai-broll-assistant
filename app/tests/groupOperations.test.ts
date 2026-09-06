import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Layer, type Scene } from "../src/domain/sceneSchema";
import {
  canFlattenGroup,
  cloneLayersToTop,
  deleteLayers,
  duplicateSelectedLayers,
  insertLayerIntoGroup,
  makeGroup,
  moveLayerTo,
  reorderSelectedLayersZIndex,
  ungroupLayer,
} from "../src/domain/groupOperations";

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
    topic: "t",
    startFrame: 0,
    durationInFrames: 200,
    layers,
  });
}

function newIdFor(used: Set<string>) {
  return (original: Layer): string => {
    const type = original.type;
    let n = 0;
    for (const id of used) {
      const match = new RegExp(`^${type}-(\\d+)$`).exec(id);
      if (match) n = Math.max(n, Number(match[1]));
    }
    let candidate = `${type}-${n + 1}`;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${type}-${n + 1}`;
    }
    used.add(candidate);
    return candidate;
  };
}

test("duplicating a top-level layer is schema-valid with unique zIndex", () => {
  const scene = sceneWith(rect("rectangle-1", 0, 0, 0), rect("rectangle-2", 200, 0, 1));
  const used = new Set(["rectangle-1", "rectangle-2"]);
  const next = duplicateSelectedLayers(scene, ["rectangle-1"], newIdFor(used));
  parseScene(next);
  const ids = next.layers.map((l) => l.id);
  assert.deepEqual(ids, ["rectangle-1", "rectangle-3", "rectangle-2"]);
  const zIndexes = next.layers.map((l) => l.zIndex);
  assert.deepEqual(zIndexes, [0, 1, 2]);
});

test("duplicating a group child keeps unique child zIndex", () => {
  const group = {
    id: "group-1",
    name: "group-1",
    type: "group",
    x: 0,
    y: 0,
    width: 210,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children: [rect("child-1", 0, 0, 0), rect("child-2", 110, 0, 1)],
  };
  const scene = sceneWith(group);
  const used = new Set(["group-1", "child-1", "child-2"]);
  const next = duplicateSelectedLayers(scene, ["child-1"], newIdFor(used));
  parseScene(next);
  const children = (next.layers[0] as { children: { id: string; zIndex: number }[] }).children;
  assert.deepEqual(
    children.map((c) => c.id),
    ["child-1", "rectangle-1", "child-2"],
  );
  assert.deepEqual(
    children.map((c) => c.zIndex),
    [0, 1, 2],
  );
});

test("reordering a top-level layer to front is schema-valid", () => {
  const scene = sceneWith(rect("rectangle-1", 0, 0, 0), rect("rectangle-2", 200, 0, 1));
  const next = reorderSelectedLayersZIndex(scene, ["rectangle-1"], "front");
  parseScene(next);
  assert.deepEqual(next.layers.map((l) => l.id), ["rectangle-2", "rectangle-1"]);
  assert.deepEqual(next.layers.map((l) => l.zIndex), [0, 1]);
});

test("pasting layers on top applies the offset and is schema-valid", () => {
  const scene = sceneWith(rect("rectangle-1", 0, 0, 0), rect("rectangle-2", 200, 0, 1));
  const used = new Set(["rectangle-1", "rectangle-2"]);
  const next = cloneLayersToTop(scene, [scene.layers[1]], newIdFor(used), 24, 24);
  parseScene(next);
  const pasted = next.layers.at(-1)!;
  assert.equal(pasted.x, 224);
  assert.equal(pasted.y, 24);
  assert.equal(pasted.zIndex, 2);
});

test("grouping removes the original layer animations", () => {
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
  const first = { ...rect("rectangle-1", 0, 0, 0), animations: [animation] };
  const second = { ...rect("rectangle-2", 200, 0, 1), animations: [animation] };
  const scene = sceneWith(first, second);

  const next = makeGroup(
    scene,
    ["rectangle-1", "rectangle-2"],
    "group-1",
    "Group 1",
  );

  assert.ok(next);
  parseScene(next);
  const group = next.layers[0];
  assert.ok(group?.type === "group");
  assert.deepEqual(group.children.map((child) => child.animations), [[], []]);
});

test("a group remains valid with one child", () => {
  const scene = sceneWith({
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
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
    children: [rect("rectangle-1", 0, 0, 0)],
  });

  assert.equal(scene.layers[0]?.type, "group");
  assert.equal(deleteLayers(scene, ["missing"]).layers[0]?.type, "group");
});

test("deleting a child preserves a singleton group", () => {
  const scene = sceneWith({
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
    width: 210,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children: [rect("rectangle-1", 0, 0, 0), rect("rectangle-2", 110, 0, 1)],
  });
  const next = deleteLayers(scene, ["rectangle-2"]);
  parseScene(next);
  const group = next.layers[0];
  assert.ok(group?.type === "group");
  assert.deepEqual(group.children.map((child) => child.id), ["rectangle-1"]);
});

test("inserting a new child centers it in the group", () => {
  const scene = sceneWith({
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
    width: 300,
    height: 200,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children: [rect("rectangle-1", 0, 0, 0)],
  });
  const childToInsert = sceneWith(rect("rectangle-2", 0, 0, 0)).layers[0];
  assert.ok(childToInsert?.type !== "group");
  const next = insertLayerIntoGroup(scene, "group-1", childToInsert);
  assert.ok(next);
  parseScene(next);
  const group = next.layers[0];
  assert.ok(group?.type === "group");
  const child = group.children.find((candidate) => candidate.id === "rectangle-2");
  assert.equal(child?.x, 100);
  assert.equal(child?.y, 70);
  assert.equal(child?.zIndex, 1);
});

test("moving a layer into and out of a group preserves geometry and clears animations", () => {
  const animation = {
    id: "enter-1",
    phase: "enter",
    preset: "fade-and-move",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
    direction: "bottom-to-top",
    travelDistance: 40,
  } as const;
  const scene = sceneWith(
    {
      id: "group-1",
      name: "Group 1",
      type: "group",
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      rotation: 0,
      opacity: 1,
      opacityEnabled: true,
      blendMode: "normal",
      zIndex: 0,
      visible: true,
      locked: false,
      animations: [],
      children: [rect("rectangle-1", 0, 0, 0)],
    },
    { ...rect("rectangle-2", 150, 140, 1), animations: [animation] },
  );

  const grouped = moveLayerTo(scene, "rectangle-2", {
    parentGroupId: "group-1",
    beforeLayerId: "rectangle-1",
  });
  assert.ok(grouped);
  parseScene(grouped);
  const group = grouped.layers.find((layer) => layer.id === "group-1");
  assert.ok(group?.type === "group");
  const child = group.children.find((candidate) => candidate.id === "rectangle-2");
  assert.equal(child?.x, 50);
  assert.equal(child?.y, 40);
  assert.deepEqual(child?.animations, []);

  const ungrouped = moveLayerTo(grouped, "rectangle-2", {
    parentGroupId: null,
    beforeLayerId: null,
  });
  assert.ok(ungrouped);
  parseScene(ungrouped);
  const moved = ungrouped.layers.find((layer) => layer.id === "rectangle-2");
  assert.equal(moved?.x, 150);
  assert.equal(moved?.y, 140);
  assert.deepEqual(moved?.animations, []);
});

test("moving the only child out removes the empty group", () => {
  const scene = sceneWith({
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
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
    children: [rect("rectangle-1", 0, 0, 0)],
  });
  const next = moveLayerTo(scene, "rectangle-1", {
    parentGroupId: null,
    beforeLayerId: "group-1",
  });
  assert.ok(next);
  parseScene(next);
  assert.deepEqual(next.layers.map((layer) => layer.id), ["rectangle-1"]);
  assert.equal(next.layers[0]?.x, 100);
  assert.equal(next.layers[0]?.y, 100);
});

test("moving between rotated groups preserves world geometry", () => {
  const scene = sceneWith(
    {
      id: "group-1",
      name: "Group 1",
      type: "group",
      x: 100,
      y: 80,
      width: 300,
      height: 200,
      rotation: 30,
      opacity: 1,
      opacityEnabled: true,
      blendMode: "normal",
      zIndex: 0,
      visible: true,
      locked: false,
      animations: [],
      children: [rect("rectangle-1", 40, 30, 0)],
    },
    {
      id: "group-2",
      name: "Group 2",
      type: "group",
      x: 600,
      y: 300,
      width: 260,
      height: 180,
      rotation: -20,
      opacity: 1,
      opacityEnabled: true,
      blendMode: "normal",
      zIndex: 1,
      visible: true,
      locked: false,
      animations: [],
      children: [rect("rectangle-2", 0, 0, 0)],
    },
  );
  const movedBetween = moveLayerTo(scene, "rectangle-1", {
    parentGroupId: "group-2",
    beforeLayerId: "rectangle-2",
  });
  assert.ok(movedBetween);
  const movedOut = moveLayerTo(movedBetween, "rectangle-1", {
    parentGroupId: null,
    beforeLayerId: null,
  });
  assert.ok(movedOut);
  parseScene(movedOut);
  const layer = movedOut.layers.find((candidate) => candidate.id === "rectangle-1");
  assert.ok(layer);
  assert.ok(Math.abs(layer.x - 168.038) < 0.002);
  assert.ok(Math.abs(layer.y - 85.359) < 0.002);
  assert.equal(layer.rotation, 30);
});

test("dropping before a sibling applies front-to-back panel order", () => {
  const animation = {
    id: "back-enter",
    phase: "enter",
    preset: "fade-and-move",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
    direction: "bottom-to-top",
    travelDistance: 40,
  } as const;
  const scene = sceneWith(
    { ...rect("back", 0, 0, 0), animations: [animation] },
    rect("middle", 0, 0, 1),
    rect("front", 0, 0, 2),
  );
  const next = moveLayerTo(scene, "back", {
    parentGroupId: null,
    beforeLayerId: "front",
  });
  assert.ok(next);
  parseScene(next);
  assert.deepEqual(
    [...next.layers]
      .sort((first, second) => second.zIndex - first.zIndex)
      .map((layer) => layer.id),
    ["back", "front", "middle"],
  );
  assert.deepEqual(
    next.layers.find((layer) => layer.id === "back")?.animations,
    [animation],
  );
});

test("ungrouping clears legacy child animations", () => {
  const legacyAnimation = {
    id: "legacy-enter",
    phase: "enter",
    preset: "fade-and-move",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
    direction: "bottom-to-top",
    travelDistance: 40,
  } as const;
  const scene = sceneWith({
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
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
    children: [{ ...rect("rectangle-1", 0, 0, 0), animations: [legacyAnimation] }],
  });
  const next = ungroupLayer(scene, "group-1");
  assert.ok(next);
  parseScene(next);
  assert.deepEqual(next.layers[0]?.animations, []);
});

test("animated groups require explicit animation removal before ungrouping", () => {
  const group = {
    id: "group-1",
    name: "Group 1",
    type: "group",
    x: 100,
    y: 100,
    width: 300,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [{
      id: "group-enter",
      phase: "enter",
      preset: "fade-and-move",
      startFrame: 0,
      durationInFrames: 20,
      easing: "ease-out",
      direction: "bottom-to-top",
      travelDistance: 0,
    }],
    children: [rect("rectangle-1", 0, 0, 0), rect("rectangle-2", 200, 0, 1)],
  } as const;
  const scene = sceneWith(group);
  const parsedGroup = scene.layers[0];
  assert.ok(parsedGroup?.type === "group");

  assert.equal(canFlattenGroup(parsedGroup), false);
  assert.equal(canFlattenGroup(parsedGroup, true), true);
  assert.equal(ungroupLayer(scene, parsedGroup.id), null);

  const next = ungroupLayer(scene, parsedGroup.id, true);
  assert.ok(next);
  parseScene(next);
  assert.deepEqual(next.layers.map((layer) => layer.id), ["rectangle-1", "rectangle-2"]);
  assert.deepEqual(next.layers.map((layer) => layer.animations), [[], []]);
});
