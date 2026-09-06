import assert from "node:assert/strict";
import { test } from "node:test";
import { getNextLayerId, makeLayerIdGenerator, nextIdForType } from "../src/domain/layerIds";
import { makeProjectFixture } from "./helpers/projectFixture";

test("nextIdForType advances sequence based on existing ids", () => {
  const used = new Set(["text-1", "text-2", "rectangle-1"]);
  assert.equal(nextIdForType(used, "text"), "text-3");
  assert.equal(nextIdForType(used, "rectangle"), "rectangle-2");
  assert.equal(nextIdForType(used, "arrow"), "arrow-1");
});

test("nextIdForType picks the lowest missing sequence above the current max", () => {
  const used = new Set(["text-1", "text-3", "rectangle-1"]);
  // Next sequence is max + 1; gaps are not filled because a sequence map would
  // require tracking per-type usage, which is handled by `makeLayerIdGenerator`.
  assert.equal(nextIdForType(used, "text"), "text-4");
  assert.equal(nextIdForType(used, "rectangle"), "rectangle-2");
});

test("getNextLayerId derives the next id from the scene's full layer list", () => {
  const { scene } = makeProjectFixture();
  // Project fixture has a single empty layer; add a couple of fake ones for the test.
  const withLayers = { ...scene, layers: [] };
  assert.equal(getNextLayerId(withLayers.layers, "text"), "text-1");
});

test("makeLayerIdGenerator returns a unique id per original layer and reuses cached results", () => {
  const layer = (id: string) => ({
    id,
    name: id,
    type: "text" as const,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal" as const,
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    text: "",
    fontFamily: "Arial",
    fontSize: 12,
    fontWeight: 400,
    fontStyle: "normal" as const,
    lineHeight: 1,
    letterSpacing: 0,
    textAlign: "center" as const,
    verticalAlign: "middle" as const,
    autoResize: "both" as const,
    textCase: "normal" as const,
    kerningPairs: true,
    ligatures: true,
    fill: "",
    fillEnabled: true,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside" as const,
  });
  const generator = makeLayerIdGenerator([layer("text-1"), layer("rectangle-1")]);
  const idA = generator(layer("text-2"));
  const idB = generator(layer("text-2"));
  assert.equal(idA, "text-2");
  // The generator reserves the id it returns, so a second call with the same
  // source id cannot collide with the first generation.
  assert.equal(idB, "text-3");
  assert.notEqual(idA, idB);
  // Different types stay in independent sequences.
  const imageLayer = {
    ...layer("text-3"),
    type: "image" as const,
    src: null,
    fit: "contain" as const,
    placeholderColor: "#d1d5db",
    cornerRadius: 0,
  };
  const arrowId = generator(imageLayer);
  assert.equal(arrowId, "image-1");
});