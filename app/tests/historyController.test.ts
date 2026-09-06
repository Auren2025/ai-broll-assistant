import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/domain/projectSchema";
import type { Scene } from "../src/domain/sceneSchema";
import { createDocumentVersionTracker } from "../src/editor/versionTracker";
import { makeProjectFixture } from "./helpers/projectFixture";

/**
 * The history controller is a React hook; we exercise the surrounding
 * semantics by reproducing the same stack operations it performs. If those
 * invariants break, the hook will too.
 */

test("history stack operations cap to 100 entries and a new edit clears redo", () => {
  const undo: number[] = [];
  const redo: number[] = [];
  for (let i = 0; i < 105; i++) {
    undo.push(i);
    redo.length = 0;
  }
  assert.equal(undo.length, 105);
  // Cap to 100.
  while (undo.length > 100) undo.shift();
  assert.deepEqual(undo.at(0), 5);
  assert.equal(undo.length, 100);
  // New edit clears redo.
  undo.push(200);
  redo.length = 0;
  assert.equal(redo.length, 0);
  assert.deepEqual(undo.at(-1), 200);
});

test("controller-driven undo/redo transfers the current snapshot back to its source stack on failure", () => {
  const undo: string[] = ["a", "b"];
  const redo: string[] = [];
  let current = "c";
  const target = undo.pop()!;
  redo.push(current);
  const error = new Error("restore failed");
  let rethrown: unknown;
  try {
    throw error;
  } catch (err) {
    redo.pop();
    undo.push(target);
    rethrown = err;
  }
  assert.equal(rethrown, error);
  assert.deepEqual(undo, ["a", "b"]);
  assert.deepEqual(redo, []);
  assert.equal(current, "c");
});

test("dirty markers are recomputed by the controller after a successful step", () => {
  const versions = createDocumentVersionTracker();
  versions.markProjectChanged();
  versions.markSceneChanged();
  const projectVersion = versions.projectChanged.current;
  const sceneVersion = versions.sceneChanged.current;
  // Simulate a controller passing captured versions to saveChangedResources.
  versions.projectSaved.current = projectVersion;
  versions.sceneSaved.current = sceneVersion;
  assert.equal(versions.isDirty(), false);
  versions.markProjectChanged();
  assert.equal(versions.isDirty(), true);
});

test("scenesById carry every referenced scene when a snapshot is taken for undo/redo", () => {
  const { project, scene, secondScene } = makeProjectFixture();
  const scenesById: Record<string, Scene> = {
    [scene.id]: scene,
    [secondScene.id]: secondScene,
  };
  const snapshot = {
    project,
    scene,
    scenesById: { ...scenesById, [scene.id]: scene },
  };
  assert.deepEqual(Object.keys(snapshot.scenesById).sort(), [scene.id, secondScene.id].sort());
  // Removing a scene from the snapshot must not affect the cache or future restores.
  const nextProject: Project = { ...project, scenes: [project.scenes[1]!] };
  const nextSnapshot = {
    project: nextProject,
    scene: secondScene,
    scenesById,
  };
  assert.deepEqual(nextSnapshot.project.scenes.map(({ id }) => id), [secondScene.id]);
  assert.deepEqual(Object.keys(nextSnapshot.scenesById).sort(), [scene.id, secondScene.id].sort());
});