import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePresentationData,
  PresentationDataSchema,
} from "../src/presentation/presentationData";

const project = {
  schemaVersion: 1 as const,
  id: "demo",
  name: "Demo",
  width: 1920,
  height: 1080,
  fps: 30,
  scenes: [
    { id: "scene-001", file: "scenes/scene-001.json" },
    { id: "scene-002", file: "scenes/scene-002.json" },
  ],
};

const scene = (id: string, startFrame: number) => ({
  schemaVersion: 1 as const,
  id,
  topic: id,
  startFrame,
  durationInFrames: 30,
  layers: [],
});

test("presentation data accepts scenes in project reference order", () => {
  const data = parsePresentationData({
    project,
    scenes: [scene("scene-001", 0), scene("scene-002", 30)],
  });

  assert.deepEqual(
    data.scenes.map((item) => item.id),
    ["scene-001", "scene-002"],
  );
});

test("presentation data rejects a missing scene", () => {
  const result = PresentationDataSchema.safeParse({
    project,
    scenes: [scene("scene-001", 0)],
  });

  assert.equal(result.success, false);
});

test("presentation data rejects scenes in a different order", () => {
  const result = PresentationDataSchema.safeParse({
    project,
    scenes: [scene("scene-002", 30), scene("scene-001", 0)],
  });

  assert.equal(result.success, false);
});
