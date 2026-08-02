import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Layer, type Scene } from "../src/domain/sceneSchema";
import {
  cloneLayersToTop,
  duplicateSelectedLayers,
  reorderSelectedLayersZIndex,
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
