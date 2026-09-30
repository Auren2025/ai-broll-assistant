import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Layer } from "../src/domain/sceneSchema";
import {
  DRILL_DIM_FACTOR,
  computeDrillEntries,
  isLayerInDrillScope,
} from "../src/editor/drillEntries";

function rect(id: string, zIndex: number) {
  return {
    id,
    name: id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    fill: "#ffffff",
    fillEnabled: true,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
    cornerEnabled: true,
    cornerRadius: 0,
    cornerRadii: null,
  } as const;
}

function group(id: string, zIndex: number, children: ReturnType<typeof rect>[]) {
  return {
    id,
    name: id,
    type: "group",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    children,
  } as const;
}

function layersWith(
  ...layers: (ReturnType<typeof rect> | ReturnType<typeof group>)[]
): Layer[] {
  return parseScene({
    schemaVersion: 1,
    id: "scene-001",
    name: "Scene 1",
    startFrame: 0,
    durationInFrames: 200,
    layers,
  }).layers;
}

test("no drill: entries mirror top-level layers, nothing dimmed or drilled", () => {
  const layers = layersWith(rect("a", 1), group("g", 2, [rect("c1", 1)]), rect("b", 3));
  const entries = computeDrillEntries(layers, null);
  assert.deepEqual(entries.map((entry) => entry.layer.id), ["a", "g", "b"]);
  assert.ok(entries.every((entry) => !entry.dimmed));
  assert.ok(entries.every((entry) => !entry.drilled));
});

test("drill: the group keeps its entry (no ungrouping), others dimmed", () => {
  const layers = layersWith(
    rect("a", 1),
    group("g", 2, [rect("c2", 2), rect("c1", 1)]),
    rect("b", 3),
  );
  const entries = computeDrillEntries(layers, "g");
  assert.deepEqual(entries.map((entry) => entry.layer.id), ["a", "g", "b"]);
  assert.deepEqual(entries.map((entry) => entry.dimmed), [true, false, true]);
  assert.deepEqual(entries.map((entry) => entry.drilled), [false, true, false]);
});

test("drill: entry order follows zIndex", () => {
  const layers = layersWith(
    rect("b", 3),
    group("g", 2, [rect("c1", 1)]),
    rect("a", 1),
  );
  const entries = computeDrillEntries(layers, "g");
  assert.deepEqual(entries.map((entry) => entry.layer.id), ["a", "g", "b"]);
});

test("drill: stale group id renders as if not drilling", () => {
  const layers = layersWith(rect("a", 1));
  const entries = computeDrillEntries(layers, "missing");
  assert.deepEqual(entries.map((entry) => entry.layer.id), ["a"]);
  assert.ok(entries.every((entry) => !entry.dimmed));
  assert.ok(entries.every((entry) => !entry.drilled));
});

test("drill: non-group id renders as if not drilling", () => {
  const layers = layersWith(rect("a", 1));
  const entries = computeDrillEntries(layers, "a");
  assert.deepEqual(entries.map((entry) => entry.layer.id), ["a"]);
  assert.ok(entries.every((entry) => !entry.dimmed));
  assert.ok(entries.every((entry) => !entry.drilled));
});

test("isLayerInDrillScope: group, children, and outsiders", () => {
  const layers = layersWith(rect("a", 1), group("g", 2, [rect("c1", 1)]));
  assert.equal(isLayerInDrillScope(layers, "g", "g"), true);
  assert.equal(isLayerInDrillScope(layers, "g", "c1"), true);
  assert.equal(isLayerInDrillScope(layers, "g", "a"), false);
  assert.equal(isLayerInDrillScope(layers, null, "g"), false);
  assert.equal(isLayerInDrillScope(layers, "missing", "g"), false);
});

test("dim factor is a visible but clearly de-emphasized value", () => {
  assert.ok(DRILL_DIM_FACTOR > 0 && DRILL_DIM_FACTOR < 0.6);
});
