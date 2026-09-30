import { test } from "node:test";
import assert from "node:assert/strict";
import type { Layer, Scene } from "../src/domain/sceneSchema";
import { cloneLayersToTop, getAllLayers } from "../src/domain/groupOperations";
import {
  getNextProjectLayerId,
  makeProjectLayerIdGenerator,
} from "../src/domain/layerIds";

function text(id: string, zIndex: number) {
  return {
    id,
    name: id,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    text: "hi",
    fontFamily: "Inter",
    fontSize: 16,
  };
}

function group(id: string, children: ReturnType<typeof text>[], zIndex: number) {
  return {
    id,
    name: id,
    type: "group",
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
    children,
  };
}

function scene(id: string, layers: Layer[]): Scene {
  return {
    id,
    name: id,
    width: 1920,
    height: 1080,
    layers,
  } as unknown as Scene;
}

test("pasting a group into another scene generates project-wide unique ids", () => {
  // Scene 1 holds group-1 with children text-1/text-2.
  const source = scene("scene-1", [group("group-1", [text("text-1", 0), text("text-2", 1)], 0)] as unknown as Layer[]);
  // Scene 2 is empty: a scene-local generator would reuse group-1/text-1/text-2.
  const target = scene("scene-2", []);

  const generator = makeProjectLayerIdGenerator([source, target]);
  const clipboard = JSON.parse(JSON.stringify(source.layers)) as Layer[];
  const idByOriginal = new Map<Layer, string>();
  for (const layer of clipboard) idByOriginal.set(layer, generator(layer));
  const newIdFor = (original: Layer): string =>
    idByOriginal.get(original) ?? generator(original);
  const updated = cloneLayersToTop(target, clipboard, newIdFor, 0, 0);

  const sourceIds = new Set(getAllLayers(source.layers).map((layer) => layer.id));
  const pastedIds = getAllLayers(updated.layers).map((layer) => layer.id);
  assert.equal(pastedIds.length, 3);
  for (const id of pastedIds) {
    assert.ok(!sourceIds.has(id), `pasted id collides with source scene: ${id}`);
  }
  assert.equal(new Set(pastedIds).size, pastedIds.length);
});

test("getNextProjectLayerId skips ids used in other scenes", () => {
  const sceneA = scene("scene-a", [text("text-1", 0)] as unknown as Layer[]);
  const sceneB = scene("scene-b", []);
  assert.equal(getNextProjectLayerId([sceneA, sceneB], "text"), "text-2");
  assert.equal(getNextProjectLayerId([sceneB], "text"), "text-1");
});
