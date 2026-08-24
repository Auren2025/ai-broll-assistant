import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import { DEFAULT_SHAPE_TEXT } from "../src/domain/shapeTextSchema";

function rectLayer(id: string, zIndex: number) {
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
  };
}

function imageLayer(src: string | null, fit?: "fill" | "contain") {
  return {
    id: "image-1",
    name: "Image",
    type: "image",
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    src,
    ...(fit ? { fit } : {}),
    cornerRadius: 0,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
  };
}

test("parseScene accepts a valid scene with a rectangle layer", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [rectLayer("rectangle-1", 0)],
  });
  assert.equal(scene.layers.length, 1);
  const layer = scene.layers[0];
  assert.equal(layer.type, "rectangle");
  if (layer.type === "rectangle") assert.deepEqual(layer.shapeText, DEFAULT_SHAPE_TEXT);
});

test("parseScene accepts nested shape text without layer-only fields", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [{ ...rectLayer("rectangle-1", 0), shapeText: { ...DEFAULT_SHAPE_TEXT, text: "Hello" } }],
  });
  const layer = scene.layers[0];
  assert.equal(layer.type, "rectangle");
  if (layer.type === "rectangle") assert.equal(layer.shapeText.text, "Hello");
  assert.throws(() => parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [{ ...rectLayer("rectangle-1", 0), shapeText: { ...DEFAULT_SHAPE_TEXT, text: "Hello", id: "not-a-layer" } }],
  }));
});

test("parseScene rejects effective text on a donut or partial circle", () => {
  const circle = {
    ...rectLayer("circle-1", 0),
    type: "circle",
    donut: 0.25,
    sweep: 360,
    startAngle: 0,
    shapeText: { ...DEFAULT_SHAPE_TEXT, text: "Invalid" },
  };
  delete (circle as Partial<typeof circle>).cornerEnabled;
  delete (circle as Partial<typeof circle>).cornerRadius;
  delete (circle as Partial<typeof circle>).cornerRadii;
  assert.throws(() => parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [circle],
  }), /requires donut=0 and sweep=360/);
});

test("parseScene rejects duplicate layer ids", () => {
  assert.throws(() =>
    parseScene({
      schemaVersion: 1,
      id: "scene-001",
      topic: "t",
      startFrame: 0,
      durationInFrames: 100,
      layers: [rectLayer("rectangle-1", 0), rectLayer("rectangle-1", 1)],
    }),
  );
});

test("parseScene rejects an animation past the scene duration", () => {
  assert.throws(() =>
    parseScene({
      schemaVersion: 1,
      id: "scene-001",
      topic: "t",
      startFrame: 0,
      durationInFrames: 10,
      layers: [
        {
          ...rectLayer("rectangle-1", 0),
          animations: [
            {
              id: "a",
              phase: "enter",
              preset: "fade",
              startFrame: 0,
              durationInFrames: 20,
              easing: "ease-out",
            },
          ],
        },
      ],
    }),
  );
});

test("parseScene accepts an unfilled image placeholder", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [imageLayer(null, "contain")],
  });
  const layer = scene.layers[0];
  assert.equal(layer.type, "image");
  if (layer.type !== "image") return;
  assert.equal(layer.src, null);
  assert.equal(layer.fit, "contain");
});

test("parseScene keeps legacy image stretching when fit is absent", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [imageLayer("assets/example.png")],
  });
  const layer = scene.layers[0];
  assert.equal(layer.type, "image");
  if (layer.type !== "image") return;
  assert.equal(layer.fit, "fill");
});

test("parseScene rejects an image source outside assets", () => {
  assert.throws(() =>
    parseScene({
      schemaVersion: 1,
      id: "scene-001",
      topic: "t",
      startFrame: 0,
      durationInFrames: 100,
      layers: [imageLayer("../example.png", "contain")],
    }),
  );
});

test("parseProject accepts a project with one scene", () => {
  const project = parseProject({
    schemaVersion: 1,
    id: "p1",
    name: "P1",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
  });
  assert.equal(project.scenes.length, 1);
});

test("parseProject rejects a project with zero scenes", () => {
  assert.throws(() =>
    parseProject({
      schemaVersion: 1,
      id: "p1",
      name: "P1",
      width: 1920,
      height: 1080,
      fps: 30,
      scenes: [],
    }),
  );
});

test("parseProject accepts an absent or null audioFile", () => {
  const base = {
    schemaVersion: 1,
    id: "p1",
    name: "P1",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
  };
  assert.equal(parseProject(base).audioFile, undefined);
  assert.equal(parseProject({ ...base, audioFile: null }).audioFile, null);
});

test("parseProject rejects an audioFile outside audio/", () => {
  assert.throws(() =>
    parseProject({
      schemaVersion: 1,
      id: "p1",
      name: "P1",
      width: 1920,
      height: 1080,
      fps: 30,
      scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
      audioFile: "voiceover.mp3",
    }),
  );
});
