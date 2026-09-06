import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import { DEFAULT_SHAPE_TEXT } from "../src/domain/shapeTextSchema";
import { LayerAnimationSchema } from "../src/domain/layerAnimationSchema";

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
              preset: "fade-and-move",
              startFrame: 0,
              durationInFrames: 20,
              easing: "ease-out",
              direction: "bottom-to-top",
              travelDistance: 40,
            },
          ],
        },
      ],
    }),
  );
});

test("parseScene enforces one preset and parameter shape per animation phase", () => {
  const baseScene = {
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
  } as const;
  const validAnimations = [
    {
      id: "in",
      phase: "enter",
      preset: "fade-and-move",
      startFrame: 0,
      durationInFrames: 20,
      easing: "ease-out",
      direction: "right-to-left",
      travelDistance: 40,
    },
    {
      id: "action",
      phase: "emphasis",
      preset: "magic-move",
      startFrame: 30,
      durationInFrames: 20,
      easing: "ease-in-out",
      translateX: 120,
      translateY: -40,
      scale: 1.2,
      opacity: 0.6,
    },
    {
      id: "out",
      phase: "exit",
      preset: "dissolve",
      startFrame: 80,
      durationInFrames: 20,
      easing: "ease-in-out",
    },
  ] as const;

  assert.doesNotThrow(() =>
    parseScene({
      ...baseScene,
      layers: [{ ...rectLayer("rectangle-1", 0), animations: validAnimations }],
    }),
  );
  assert.throws(() =>
    parseScene({
      ...baseScene,
      layers: [
        {
          ...rectLayer("rectangle-1", 0),
          animations: [{ ...validAnimations[0], phase: "exit" }],
        },
      ],
    }),
  );
});

test("parseScene accepts Line Draw only on shapes with an effective stroke", () => {
  const lineDraw = {
    id: "line-draw",
    phase: "enter",
    preset: "line-draw",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
    direction: "clockwise",
  } as const;
  const scene = {
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
  } as const;

  assert.doesNotThrow(() =>
    parseScene({
      ...scene,
      layers: [
        {
          ...rectLayer("rectangle-1", 0),
          stroke: "#ffffff",
          strokeWidth: 2,
          animations: [lineDraw],
        },
      ],
    }),
  );
  assert.throws(
    () =>
      parseScene({
        ...scene,
        layers: [
          { ...rectLayer("rectangle-1", 0), animations: [lineDraw] },
        ],
      }),
    /requires an effective shape stroke/,
  );
  assert.throws(
    () =>
      parseScene({
        ...scene,
        layers: [
          {
            ...rectLayer("rectangle-1", 0),
            stroke: "#ffffff",
            strokeWidth: 2,
            animations: [{ ...lineDraw, direction: "start-to-end" }],
          },
        ],
      }),
    /invalid Line Draw direction/,
  );
});

test("Build In presets use strict, phase-specific parameter shapes", () => {
  const timing = {
    id: "build-in",
    phase: "enter",
    startFrame: 0,
    durationInFrames: 20,
    easing: "ease-out",
  } as const;
  const wipeDirections = [
    "left-to-right",
    "right-to-left",
    "top-to-bottom",
    "bottom-to-top",
    "top-left-to-bottom-right",
    "top-right-to-bottom-left",
    "bottom-left-to-top-right",
    "bottom-right-to-top-left",
  ] as const;

  for (const direction of wipeDirections) {
    assert.doesNotThrow(() =>
      LayerAnimationSchema.parse({ ...timing, preset: "wipe", direction }),
    );
  }
  assert.doesNotThrow(() =>
    LayerAnimationSchema.parse({ ...timing, preset: "dissolve-in" }),
  );
  assert.doesNotThrow(() =>
    LayerAnimationSchema.parse({
      ...timing,
      preset: "scale-in",
      direction: "up",
      bounce: false,
    }),
  );
  assert.doesNotThrow(() =>
    LayerAnimationSchema.parse({ ...timing, preset: "scale-big" }),
  );
  assert.throws(() =>
    LayerAnimationSchema.parse({
      ...timing,
      preset: "scale-in",
      direction: "up",
    }),
  );
  assert.throws(() =>
    LayerAnimationSchema.parse({
      ...timing,
      preset: "dissolve-in",
      phase: "exit",
    }),
  );
  assert.throws(() =>
    LayerAnimationSchema.parse({
      ...timing,
      preset: "wipe",
      direction: "clockwise",
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

test("parseScene defaults the image placeholder color to light gray", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [imageLayer(null)],
  });
  const layer = scene.layers[0];
  assert.equal(layer.type, "image");
  if (layer.type !== "image") return;
  assert.equal(layer.placeholderColor, "#d1d5db");
});

test("parseScene accepts a custom image placeholder color", () => {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 100,
    layers: [{ ...imageLayer(null), placeholderColor: "#3366ff" }],
  });
  const layer = scene.layers[0];
  assert.equal(layer.type, "image");
  if (layer.type !== "image") return;
  assert.equal(layer.placeholderColor, "#3366ff");
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

test("parseProject accepts a project-root audio filename", () => {
  const project = parseProject({
    schemaVersion: 1,
    id: "p1",
    name: "P1",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
    audioFile: "voiceover.mp3",
  });
  assert.equal(project.audioFile, "voiceover.mp3");
});

test("parseProject accepts a legacy audio/ path", () => {
  const project = parseProject({
    schemaVersion: 1,
    id: "p1",
    name: "P1",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
    audioFile: "audio/voiceover.mp3",
  });
  assert.equal(project.audioFile, "audio/voiceover.mp3");
});

test("parseProject rejects an audioFile in another directory", () => {
  assert.throws(() =>
    parseProject({
      schemaVersion: 1,
      id: "p1",
      name: "P1",
      width: 1920,
      height: 1080,
      fps: 30,
      scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
      audioFile: "media/voiceover.mp3",
    }),
  );
});
