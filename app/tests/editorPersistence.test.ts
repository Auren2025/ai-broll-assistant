import assert from "node:assert/strict";
import { test } from "node:test";
import { ExternalChangeConflictError } from "../src/api/projectApi";
import { enqueueSave, saveChangedResources, type SaveSnapshot } from "../src/editor/persistence";
import { deferred, makeProjectFixture } from "./helpers/projectFixture";

function setup(projectVersion = 1, sceneVersion = 1) {
  const { project, scene } = makeProjectFixture();
  const snapshot: SaveSnapshot = { project, scene, projectVersion, sceneVersion };
  const versions = { project: { current: 0 }, scene: { current: 0 } };
  const calls: string[] = [];
  const resources = {
    saveProject: async () => { calls.push("project"); },
    saveScene: async () => { calls.push("scene"); },
    onSceneSaved: () => { calls.push("scene-accepted"); },
  };
  return { snapshot, versions, calls, resources };
}

test("editor saves only changed resources, in project then scene order", async () => {
  for (const [projectVersion, sceneVersion, expected] of [
    [0, 0, []], [1, 0, ["project"]], [0, 1, ["scene", "scene-accepted"]],
    [1, 1, ["project", "scene", "scene-accepted"]],
  ] as const) {
    const { snapshot, versions, calls, resources } = setup(projectVersion, sceneVersion);
    await saveChangedResources(snapshot, versions, resources);
    assert.deepEqual(calls, expected);
    assert.equal(versions.project.current, projectVersion);
    assert.equal(versions.scene.current, sceneVersion);
  }
});

test("queued saves cannot overlap and duplicate captured versions write only once", async () => {
  const { snapshot, versions, calls, resources } = setup();
  const started = deferred();
  const release = deferred();
  resources.saveProject = async () => {
    calls.push("project");
    started.resolve();
    await release.promise;
  };
  const save = () => saveChangedResources(snapshot, versions, resources);
  const first = enqueueSave(Promise.resolve(), save);
  const duplicate = enqueueSave(first.settled, save);
  const secondScene = { ...snapshot.scene, topic: "New edit" };
  const next = enqueueSave(duplicate.settled, () => saveChangedResources(
    { ...snapshot, scene: secondScene, sceneVersion: 2 }, versions, resources,
  ));
  await started.promise;
  assert.deepEqual(calls, ["project"]);
  assert.equal(versions.project.current, 0);
  release.resolve();
  await Promise.all([first.result, duplicate.result, next.result]);
  assert.deepEqual(calls, ["project", "scene", "scene-accepted", "scene", "scene-accepted"]);
  assert.equal(versions.scene.current, 2);
});

test("an in-flight save acknowledges only its captured version, leaving later edits dirty", async () => {
  const { snapshot, versions, resources } = setup(0, 1);
  const started = deferred();
  const release = deferred();
  resources.saveScene = async () => { started.resolve(); await release.promise; };
  const save = saveChangedResources(snapshot, versions, resources);
  await started.promise;
  const currentEditVersion = 2;
  release.resolve();
  await save;
  assert.equal(versions.scene.current, 1);
  assert.ok(currentEditVersion > versions.scene.current);
});

test("project failure preserves both dirty versions and prevents scene writes", async () => {
  const { snapshot, versions, calls, resources } = setup();
  const error = new Error("disk unavailable");
  resources.saveProject = async () => { throw error; };
  await assert.rejects(saveChangedResources(snapshot, versions, resources), (actual) => actual === error);
  assert.deepEqual(calls, []);
  assert.deepEqual(versions, { project: { current: 0 }, scene: { current: 0 } });
});

test("scene failure remains retryable without rewriting an already saved project", async () => {
  const { snapshot, versions, calls, resources } = setup();
  resources.saveScene = async () => { calls.push("scene-failed"); throw new Error("disk unavailable"); };
  const first = enqueueSave(Promise.resolve(), () => saveChangedResources(snapshot, versions, resources));
  await assert.rejects(first.result, /disk unavailable/);
  await first.settled;
  assert.deepEqual(versions, { project: { current: 1 }, scene: { current: 0 } });
  resources.saveScene = async () => { calls.push("scene-retry"); };
  const retry = enqueueSave(first.settled, () => saveChangedResources(snapshot, versions, resources));
  await retry.result;
  assert.deepEqual(calls, ["project", "scene-failed", "scene-retry", "scene-accepted"]);
  assert.equal(versions.scene.current, 1);
});

test("conflicts propagate intact; only an explicit force retry bypasses conditional writes", async () => {
  const { snapshot, versions } = setup(0, 1);
  const forces: boolean[] = [];
  const conflict = new ExternalChangeConflictError();
  let accepted = 0;
  const resources = {
    saveProject: async () => { assert.fail("unchanged project must not be saved"); },
    saveScene: async (_id: string, _scene: typeof snapshot.scene, options: { force: boolean }) => {
      forces.push(options.force);
      if (!options.force) throw conflict;
    },
    onSceneSaved: () => { accepted++; },
  };
  const first = enqueueSave(Promise.resolve(), () => saveChangedResources(snapshot, versions, resources));
  await assert.rejects(first.result, (error) => error === conflict);
  assert.equal(versions.scene.current, 0);
  assert.equal(accepted, 0);
  const retry = enqueueSave(first.settled, () => saveChangedResources(snapshot, versions, resources, true));
  await retry.result;
  assert.deepEqual(forces, [false, true]);
  assert.equal(versions.scene.current, 1);
  assert.equal(accepted, 1);
});
