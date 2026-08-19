import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { validateProjectDirectory } from "../scripts/projectValidation";

function makeProjectDirectory(source?: string): string {
  const projectDirectory = mkdtempSync(resolve(tmpdir(), "ai-broll-validation-"));
  mkdirSync(resolve(projectDirectory, "scenes"));
  writeFileSync(
    resolve(projectDirectory, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "validation-test",
      name: "Validation test",
      width: 1920,
      height: 1080,
      fps: 30,
      scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
    }),
  );
  writeFileSync(
    resolve(projectDirectory, "scenes/scene-001.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "scene-001",
      topic: "Validation test scene",
      startFrame: 0,
      durationInFrames: 30,
      layers: [],
    }),
  );
  if (source !== undefined) {
    writeFileSync(resolve(projectDirectory, "source.srt"), source);
  }
  return projectDirectory;
}

test("project validation requires source.srt", () => {
  const projectDirectory = makeProjectDirectory();
  try {
    assert.throws(
      () => validateProjectDirectory(projectDirectory),
      /source\.srt.*missing/i,
    );
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test("project validation rejects an empty source.srt", () => {
  const projectDirectory = makeProjectDirectory("");
  try {
    assert.throws(
      () => validateProjectDirectory(projectDirectory),
      /no subtitle blocks found/i,
    );
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test("project validation accepts cue-aligned scenes within source duration", () => {
  const projectDirectory = makeProjectDirectory(
    "1\n00:00:00,000 --> 00:00:01,000\nValidation cue\n",
  );
  try {
    const result = validateProjectDirectory(projectDirectory);
    assert.equal(result.project.id, "validation-test");
    assert.equal(result.scenes.length, 1);
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test("project validation accepts an unfilled image placeholder", () => {
  const projectDirectory = makeProjectDirectory(
    "1\n00:00:00,000 --> 00:00:01,000\nValidation cue\n",
  );
  try {
    writeFileSync(
      resolve(projectDirectory, "scenes/scene-001.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "scene-001",
        topic: "Validation test scene",
        startFrame: 0,
        durationInFrames: 30,
        layers: [
          {
            id: "image-1",
            name: "Image placeholder",
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
            src: null,
            fit: "contain",
            cornerRadius: 0,
            stroke: null,
            strokeWidth: 0,
            strokePosition: "inside",
          },
        ],
      }),
    );
    const result = validateProjectDirectory(projectDirectory);
    assert.equal(result.scenes[0].layers[0].type, "image");
  } finally {
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});
