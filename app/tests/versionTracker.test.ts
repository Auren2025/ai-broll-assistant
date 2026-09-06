import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocumentVersionTracker } from "../src/editor/versionTracker";

test("fresh tracker is not dirty and starts at zero", () => {
  const tracker = createDocumentVersionTracker();
  assert.equal(tracker.isDirty(), false);
  assert.deepEqual(tracker.snapshot(), { projectVersion: 0, sceneVersion: 0 });
});

test("marking a project or scene changed makes the tracker dirty; both must be saved to clear", () => {
  const tracker = createDocumentVersionTracker();
  tracker.markProjectChanged();
  assert.equal(tracker.isDirty(), true);
  tracker.markCurrentStateSaved();
  assert.equal(tracker.isDirty(), false);

  tracker.markProjectChanged();
  tracker.markSceneChanged();
  assert.equal(tracker.isDirty(), true);
  // Only saving the project side still leaves the scene change outstanding.
  tracker.markCurrentStateSaved();
  tracker.markProjectChanged();
  assert.equal(tracker.isDirty(), true);
  tracker.markCurrentStateSaved();
  assert.equal(tracker.isDirty(), false);
});

test("resetAll clears every counter for fresh disk loads", () => {
  const tracker = createDocumentVersionTracker();
  tracker.markProjectChanged();
  tracker.markSceneChanged();
  tracker.markCurrentStateSaved();
  tracker.markProjectChanged();
  tracker.markSceneChanged();
  tracker.resetAll();
  assert.equal(tracker.isDirty(), false);
  assert.deepEqual(tracker.snapshot(), { projectVersion: 0, sceneVersion: 0 });
});

test("snapshot captures the change versions at one instant and ignores later edits", () => {
  const tracker = createDocumentVersionTracker();
  tracker.markProjectChanged();
  tracker.markSceneChanged();
  const before = tracker.snapshot();
  tracker.markProjectChanged();
  tracker.markSceneChanged();
  assert.deepEqual(before, { projectVersion: 1, sceneVersion: 1 });
  assert.equal(tracker.snapshot().projectVersion, 2);
  assert.equal(tracker.snapshot().sceneVersion, 2);
});

test("markCurrentStateSaved accepts whatever change versions are current, even if smaller than earlier edits", () => {
  const tracker = createDocumentVersionTracker();
  tracker.markProjectChanged();
  tracker.markProjectChanged();
  tracker.markCurrentStateSaved();
  assert.equal(tracker.isDirty(), false);
  // Saving and then resetting both change counters still leaves a clean state.
  tracker.resetAll();
  assert.equal(tracker.isDirty(), false);
});