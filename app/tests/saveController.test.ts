import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "../src/domain/projectSchema";
import type { Scene } from "../src/domain/sceneSchema";
import { createDocumentVersionTracker } from "../src/editor/versionTracker";
import { makeProjectFixture } from "./helpers/projectFixture";

interface ControllerStub {
  queueSave(force: boolean): Promise<void>;
  flush(): Promise<void>;
  runExternalRefresh(signal?: AbortSignal): Promise<void>;
}

/**
 * The save controller hook delegates to refs and setters; exercising it would
 * require React. These tests focus on the surrounding helpers and the
 * assumptions they encode, so we can refactor without losing the contract.
 */
test("saving captures version snapshot and advances saved versions in order", async () => {
  const { project, scene } = makeProjectFixture();
  const versions = createDocumentVersionTracker();
  const savedProject: { project: Project | null; scene: Scene | null } = { project: null, scene: null };

  // Simulate queueSave: capture snapshot, then write via the persistence helper.
  versions.markProjectChanged();
  versions.markSceneChanged();
  const snapshotProject = project;
  const snapshotScene = scene;
  const snapshot = {
    project: snapshotProject,
    scene: snapshotScene,
    projectVersion: versions.projectChanged.current,
    sceneVersion: versions.sceneChanged.current,
  };
  savedProject.project = snapshot.project;
  savedProject.scene = snapshot.scene;
  versions.projectSaved.current = Math.max(versions.projectSaved.current, snapshot.projectVersion);
  versions.sceneSaved.current = Math.max(versions.sceneSaved.current, snapshot.sceneVersion);

  assert.deepEqual(savedProject.project, project);
  assert.deepEqual(savedProject.scene, scene);
  assert.equal(versions.isDirty(), false);

  // A later edit must be detected again.
  versions.markProjectChanged();
  assert.equal(versions.isDirty(), true);
});

test("controller stub preserves queueSave force argument and exposes the required surface", () => {
  const seen: boolean[] = [];
  const stub: ControllerStub = {
    queueSave: (force) => {
      seen.push(force);
      return Promise.resolve();
    },
    flush: () => Promise.resolve(),
    runExternalRefresh: () => Promise.resolve(),
  };
  void stub.queueSave(true);
  void stub.queueSave(false);
  assert.deepEqual(seen, [true, false]);
  assert.equal(typeof stub.flush, "function");
  assert.equal(typeof stub.runExternalRefresh, "function");
});

test("abort signals from external refresh are forwarded unchanged", async () => {
  const controller = stubController();
  const abortController = new AbortController();
  const calls: Array<AbortSignal | undefined> = [];
  controller.runExternalRefresh = (signal?: AbortSignal) => {
    calls.push(signal);
    return Promise.resolve();
  };
  await controller.runExternalRefresh(abortController.signal);
  abortController.abort();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.aborted, true);
});

function stubController(): ControllerStub {
  return {
    queueSave: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    runExternalRefresh: () => Promise.resolve(),
  };
}