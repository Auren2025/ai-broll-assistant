import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { alignSceneLayers } from "../src/editor/alignment";

function rect(
  id: string,
  x: number,
  y: number,
  zIndex: number,
  width = 100,
  height = 60,
) {
  return {
    id,
    name: id,
    type: "rectangle",
    x,
    y,
    width,
    height,
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

function findLayer(scene: Scene, id: string) {
  const layer = scene.layers.find((l) => l.id === id);
  if (!layer) throw new Error(`layer ${id} missing`);
  return layer;
}

const PROJECT_W = 1920;
const PROJECT_H = 1080;

test("abut-horizontal-left with two layers: right layer's left edge meets left layer's right edge", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0), // a.left=100, a.right=200
    rect("b", 300, 100, 1), // b.left=300, b.right=400
  );
  const result = alignSceneLayers(scene, ["a", "b"], "abut-horizontal-left", PROJECT_W, PROJECT_H);
  const b = findLayer(result, "b");
  // b.left should now equal a.right = 200
  assert.equal(b.x, 200);
  // b.y unchanged
  assert.equal(b.y, 100);
  // a unchanged
  assert.equal(findLayer(result, "a").x, 100);
});

test("abut-horizontal-right with two layers: left layer's right edge meets right layer's left edge", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0), // a.right = 200
    rect("b", 300, 100, 1), // b.left = 300
  );
  const result = alignSceneLayers(scene, ["a", "b"], "abut-horizontal-right", PROJECT_W, PROJECT_H);
  const a = findLayer(result, "a");
  // a.right should equal b.left = 300, so a.x = 300 - 100 = 200
  assert.equal(a.x, 200);
  // b unchanged
  assert.equal(findLayer(result, "b").x, 300);
});

test("abut-vertical-top with two layers: bottom layer's top edge meets top layer's bottom edge", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0), // a.top=100, a.bottom=160
    rect("b", 100, 300, 1), // b.top=300, b.bottom=360
  );
  const result = alignSceneLayers(scene, ["a", "b"], "abut-vertical-top", PROJECT_W, PROJECT_H);
  const b = findLayer(result, "b");
  // b.top should equal a.bottom = 160
  assert.equal(b.y, 160);
  assert.equal(b.x, 100);
  assert.equal(findLayer(result, "a").y, 100);
});

test("abut-vertical-bottom with two layers: top layer's bottom edge meets bottom layer's top edge", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0),
    rect("b", 100, 300, 1),
  );
  const result = alignSceneLayers(scene, ["a", "b"], "abut-vertical-bottom", PROJECT_W, PROJECT_H);
  const a = findLayer(result, "a");
  // a.bottom should equal b.top = 300, so a.y = 300 - 60 = 240
  assert.equal(a.y, 240);
  // b unchanged
  assert.equal(findLayer(result, "b").y, 300);
});

test("abut-horizontal-left with three layers: only the second-from-left moves", () => {
  const scene = sceneWith(
    rect("a", 0, 0, 0), // a.right = 100
    rect("b", 200, 0, 1), // b.left = 200
    rect("c", 400, 0, 2), // c.right = 500
  );
  const result = alignSceneLayers(
    scene,
    ["a", "b", "c"],
    "abut-horizontal-left",
    PROJECT_W,
    PROJECT_H,
  );
  // a (anchor) and c (rightmost) stay; b moves so b.left = a.right = 100.
  assert.equal(findLayer(result, "a").x, 0);
  assert.equal(findLayer(result, "b").x, 100);
  assert.equal(findLayer(result, "c").x, 400);
});

test("abut-horizontal-right with three layers: only the second-from-right moves", () => {
  const scene = sceneWith(
    rect("a", 0, 0, 0),
    rect("b", 200, 0, 1),
    rect("c", 400, 0, 2),
  );
  const result = alignSceneLayers(
    scene,
    ["a", "b", "c"],
    "abut-horizontal-right",
    PROJECT_W,
    PROJECT_H,
  );
  // b moves so b.right = c.left = 400 → b.x = 300.
  assert.equal(findLayer(result, "a").x, 0);
  assert.equal(findLayer(result, "b").x, 300);
  assert.equal(findLayer(result, "c").x, 400);
});

test("abut actions are no-ops with a single selected layer", () => {
  const scene = sceneWith(rect("a", 100, 100, 0));
  const result = alignSceneLayers(scene, ["a"], "abut-horizontal-left", PROJECT_W, PROJECT_H);
  assert.equal(result, scene, "scene should be returned unchanged");
});

test("abut actions are no-ops with an empty selection", () => {
  const scene = sceneWith(rect("a", 100, 100, 0));
  const result = alignSceneLayers(scene, [], "abut-horizontal-left", PROJECT_W, PROJECT_H);
  assert.equal(result, scene);
});

test("abut actions across mixed coordinate spaces (group child + scene root) are no-ops", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0),
    {
      id: "g",
      name: "g",
      type: "group",
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      rotation: 0,
      opacity: 1,
      opacityEnabled: true,
      blendMode: "normal",
      zIndex: 1,
      visible: true,
      locked: false,
      animations: [],
      children: [
        rect("child1", 50, 50, 0),
        rect("child2", 250, 50, 1),
      ],
    },
  );
  const before = JSON.parse(JSON.stringify(scene));
  const result = alignSceneLayers(
    scene,
    ["a", "child1"],
    "abut-horizontal-left",
    PROJECT_W,
    PROJECT_H,
  );
  assert.deepEqual(result, before, "scene should be unchanged when coordinate spaces are mixed");
});

test("abut actions inside a group work in group-local coordinates", () => {
  const scene = sceneWith({
    id: "g",
    name: "g",
    type: "group",
    x: 100,
    y: 100,
    width: 500,
    height: 500,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children: [
      rect("a", 50, 50, 0),  // group-local x=50, width=100, so right=150
      rect("b", 250, 50, 1), // group-local x=250, width=100, so left=250
    ],
  });
  const result = alignSceneLayers(
    scene,
    ["a", "b"],
    "abut-horizontal-left",
    PROJECT_W,
    PROJECT_H,
  );
  // b's group-local x should snap so b.left = a.right = 150 → b.x = 150.
  // (roundCoordinate applies; with these round numbers it's exact.)
  const g = result.layers.find((l) => l.type === "group");
  assert.ok(g && g.type === "group");
  const b = g.children.find((c) => c.id === "b");
  assert.ok(b);
  assert.equal(b.x, 150);
  // a unchanged
  const a = g.children.find((c) => c.id === "a");
  assert.ok(a);
  assert.equal(a.x, 50);
});

test("existing 6-way alignment still works after refactor (sanity check)", () => {
  const scene = sceneWith(
    rect("a", 100, 100, 0),
    rect("b", 400, 300, 1),
  );
  const result = alignSceneLayers(scene, ["a", "b"], "left", PROJECT_W, PROJECT_H);
  // Combined bounds: left=100, right=500. Both snap to left=100, so both.x=100.
  assert.equal(findLayer(result, "a").x, 100);
  assert.equal(findLayer(result, "b").x, 100);
});

test("existing distribute-horizontal still works after refactor (sanity check)", () => {
  const scene = sceneWith(
    rect("a", 0, 0, 0), // width 100, right=100
    rect("b", 200, 0, 1),
    rect("c", 600, 0, 2), // width 100, right=700
  );
  const result = alignSceneLayers(scene, ["a", "b", "c"], "distribute-horizontal", PROJECT_W, PROJECT_H);
  // span=700 (a.left=0 → c.right=700), totalSize=300 (3×100), gap=(700-300)/2=200.
  // Algorithm preserves a and c positions; only b moves to be equidistant.
  // b ends up at x=300 (center=350, gap of 200 on each side).
  assert.equal(findLayer(result, "a").x, 0);
  assert.equal(findLayer(result, "c").x, 600);
  assert.equal(findLayer(result, "b").x, 300);
});