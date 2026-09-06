import assert from "node:assert/strict";
import { test } from "node:test";
import { applyHistoryStep, recordHistorySnapshot } from "../src/editor/history";
import { saveChangedResources } from "../src/editor/persistence";
import { deferred, makeProjectFixture } from "./helpers/projectFixture";

function snapshots() {
  const { project, scene, secondScene } = makeProjectFixture();
  const before = {
    project, scene, scenesById: { [scene.id]: scene, [secondScene.id]: secondScene },
    selectedLayerIds: ["text-1"], inspectorScope: "layer", isDirty: false,
  };
  const changedScene = { ...scene, topic: "Changed topic" };
  const after: typeof before = {
    ...before, scene: changedScene,
    scenesById: { ...before.scenesById, [scene.id]: changedScene },
    selectedLayerIds: [], inspectorScope: "scene", isDirty: true,
  };
  return { before, after };
}

test("history retains the latest 100 snapshots and a new edit clears redo", () => {
  const undo: number[] = [];
  const redo = [500];
  for (let i = 0; i < 105; i++) recordHistorySnapshot(undo, redo, i);
  assert.equal(undo.length, 100);
  assert.equal(undo[0], 5);
  assert.equal(undo.at(-1), 104);
  assert.deepEqual(redo, []);
});

test("undo and redo restore complete snapshots, including selection and scene cache", async () => {
  const { before, after } = snapshots();
  const undo = [before];
  const redo: typeof undo = [];
  let current = after;
  const apply = async (snapshot: typeof before) => { current = snapshot; };
  await applyHistoryStep(undo, redo, current, apply);
  assert.strictEqual(current, before);
  assert.deepEqual(undo, []);
  assert.deepEqual(redo, [after]);
  await applyHistoryStep(redo, undo, current, apply);
  assert.strictEqual(current, after);
  assert.deepEqual(undo, [before]);
  assert.deepEqual(redo, []);
});

test("failed undo or redo restores stack order and rethrows the original error", async () => {
  const { before, after } = snapshots();
  for (const [target, current] of [[before, after], [after, before]]) {
    const from = [current, target];
    const to = [target];
    const error = new Error("restore failed");
    const started = deferred();
    const release = deferred();
    const applying = applyHistoryStep(from, to, current, async () => {
      started.resolve();
      await release.promise;
      throw error;
    });
    await started.promise;
    assert.deepEqual(from, [current]);
    assert.deepEqual(to, [target, current]);
    const rejected = assert.rejects(applying, (actual) => actual === error);
    release.resolve();
    await rejected;
    assert.deepEqual(from, [current, target]);
    assert.deepEqual(to, [target]);
  }
});

test("empty or cleared history is a no-op and cannot restore stale scenes", async () => {
  const { before, after } = snapshots();
  const undo = [before];
  const redo = [after];
  undo.length = 0;
  redo.length = 0;
  await applyHistoryStep(undo, redo, after, async () => assert.fail("history was cleared"));
  assert.deepEqual(undo, []);
  assert.deepEqual(redo, []);
});

test("history-applied content can be persisted through the same versioned save path", async () => {
  const { before, after } = snapshots();
  const undo = [before];
  const redo: typeof undo = [];
  let current = after;
  let sceneVersion = 1;
  const savedVersions = { project: { current: 0 }, scene: { current: 1 } };
  const written: string[] = [];
  const apply = async (snapshot: typeof before) => { current = snapshot; sceneVersion++; };
  const save = () => saveChangedResources(
    { project: current.project, scene: current.scene, projectVersion: 0, sceneVersion },
    savedVersions,
    {
      saveProject: async () => assert.fail("project is unchanged"),
      saveScene: async (_id, scene) => { written.push(scene.topic); },
      onSceneSaved: () => {},
    },
  );
  await applyHistoryStep(undo, redo, current, apply);
  assert.ok(sceneVersion > savedVersions.scene.current);
  await save();
  await applyHistoryStep(redo, undo, current, apply);
  await save();
  assert.deepEqual(written, [before.scene.topic, after.scene.topic]);
  assert.equal(savedVersions.scene.current, sceneVersion);
});
