import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import { sceneStartFrame } from "../src/domain/scenePlacement";

const scene = parseScene({
  schemaVersion: 2,
  id: "scene-001",
  topic: "One",
  durationInFrames: 30,
  layers: [],
});

function project(kind: "broll" | "slide", startFrame?: number) {
  return parseProject({
    schemaVersion: 2,
    id: "test",
    kind,
    name: "Test",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: scene.id, file: "scenes/scene-001.json", ...(startFrame === undefined ? {} : { startFrame }) }],
  });
}

test("B-roll placement belongs to the project reference", () => {
  assert.equal(sceneStartFrame(project("broll", 45), scene), 45);
  assert.throws(() => project("broll"), /timeline startFrame/);
});

test("slide page has no absolute position", () => {
  assert.equal(sceneStartFrame(project("slide"), scene), 0);
  assert.throws(() => project("slide", 45), /cannot have a timeline startFrame/);
});

test("new scenes reject absolute position, while legacy scenes remain readable", () => {
  assert.throws(() => parseScene({ ...scene, startFrame: 45 }), /project scene reference/);
  const legacy = parseScene({ ...scene, schemaVersion: 1, startFrame: 45 });
  assert.equal(sceneStartFrame(project("slide"), legacy), 0);
});
