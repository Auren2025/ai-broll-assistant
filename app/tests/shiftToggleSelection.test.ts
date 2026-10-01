import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { toggleShiftSelection } from "../src/editor/shiftToggleSelection";

function rect(id: string, zIndex: number) {
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

function group(id: string, children: ReturnType<typeof rect>[]) {
  return {
    id,
    name: id,
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

const scene = sceneWith(
  rect("a", 0),
  rect("b", 1),
  { ...group("g", [rect("c1", 0), rect("c2", 1)]), zIndex: 2 },
);

test("shift+click on unselected plain layer adds it", () => {
  assert.deepEqual(toggleShiftSelection(["a"], "b", scene), ["a", "b"]);
});

test("shift+click on selected layer removes it (toggle off)", () => {
  assert.deepEqual(toggleShiftSelection(["a", "b"], "b", scene), ["a"]);
});

test("shift+click on the last selected layer empties the selection", () => {
  assert.deepEqual(toggleShiftSelection(["a"], "a", scene), []);
});

test("adding a group drops its children's ids (mutual exclusion)", () => {
  assert.deepEqual(toggleShiftSelection(["a", "c1"], "g", scene), ["a", "g"]);
});

test("adding a child drops its parent group's id (mutual exclusion)", () => {
  assert.deepEqual(toggleShiftSelection(["a", "g"], "c1", scene), ["a", "c1"]);
});

test("adding a drill/group child keeps unrelated selection", () => {
  assert.deepEqual(toggleShiftSelection(["a"], "c1", scene), ["a", "c1"]);
});

test("unknown id toggles plainly without crashing", () => {
  assert.deepEqual(toggleShiftSelection(["a"], "missing", scene), [
    "a",
    "missing",
  ]);
});
