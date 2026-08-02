import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";

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
