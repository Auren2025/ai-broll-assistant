import assert from "node:assert/strict";
import { test } from "node:test";
import { Rect } from "fabric";
import {
  applyLayerToFabricObject,
  isFabricObjectLocked,
  setFabricObjectLocked,
} from "../src/editor/fabricAdapter.ts";
import type { Layer } from "../src/domain/sceneSchema";

function rectLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: "r1",
    type: "rectangle",
    name: "R",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    opacityEnabled: false,
    blendMode: "normal",
    fillEnabled: true,
    fill: "#ff0000",
    cornerEnabled: false,
    cornerRadius: 0,
    ...overrides,
  } as Layer;
}

test("locked layer stays selectable but fully transform-locked", () => {
  const object = new Rect({});
  applyLayerToFabricObject(object, rectLayer({ locked: true }), undefined, "p1");
  assert.equal(isFabricObjectLocked(object), true);
  // Keynote-style: locked objects can be selected...
  assert.equal(object.selectable, true);
  assert.equal(object.evented, true);
  // ...but nothing about them can change.
  assert.equal(object.lockMovementX, true);
  assert.equal(object.lockMovementY, true);
  assert.equal(object.lockRotation, true);
  assert.equal(object.lockScalingX, true);
  assert.equal(object.lockScalingY, true);
  // Fabric's blue selection chrome is disabled; the locked painter draws
  // gray + X instead.
  assert.equal(object.hasBorders, false);
  assert.equal(object.hasControls, false);
});

test("unlocked layer is not marked locked and keeps blue chrome", () => {
  const object = new Rect({});
  applyLayerToFabricObject(object, rectLayer({ locked: false }), undefined, "p1");
  assert.equal(isFabricObjectLocked(object), false);
  assert.equal(object.lockMovementX, false);
  assert.equal(object.hasBorders, true);
  assert.equal(object.hasControls, true);
});

test("setFabricObjectLocked can clear the flag", () => {
  const object = new Rect({});
  setFabricObjectLocked(object, true);
  assert.equal(isFabricObjectLocked(object), true);
  setFabricObjectLocked(object, false);
  assert.equal(isFabricObjectLocked(object), false);
});
