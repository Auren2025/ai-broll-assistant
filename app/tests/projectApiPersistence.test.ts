import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ExternalChangeConflictError, fetchProject, fetchScene,
  fetchSceneResource, saveProject, saveScene,
} from "../src/api/projectApi";
import { makeProjectFixture } from "./helpers/projectFixture";

function json(body: unknown, etag: string, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ETag: etag } });
}

test("scene ETags remain uncommitted until the caller accepts a fetched snapshot", async (t) => {
  const { project, scene } = makeProjectFixture("scene-deferred-etag");
  const headers: Array<string | null> = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    headers.push(new Headers(init?.headers).get("If-Match"));
    return init?.method === "PUT"
      ? new Response(JSON.stringify(scene))
      : json(scene, '"scene-v1"');
  });
  const fetched = await fetchSceneResource(project.id, scene.id);
  await saveScene(project.id, scene);
  fetched.commitEtag();
  await saveScene(project.id, scene);
  assert.deepEqual(headers, [null, null, '"scene-v1"']);
});

test("project and scene ETags are isolated; conflicts and failed writes do not accept server ETags", async (t) => {
  const { project, scene } = makeProjectFixture("isolated-etags");
  const sent: Array<{ url: string; etag: string | null }> = [];
  let failure: 0 | 412 | 500 = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    const isScene = url.includes("/scenes/");
    if (init?.method === "PUT") {
      sent.push({ url, etag: new Headers(init.headers).get("If-Match") });
      if (failure) return json({ error: "Rejected write" }, '"must-not-accept"', failure);
    }
    return json(isScene ? scene : project, isScene ? '"scene-version"' : '"project-version"');
  });
  await fetchProject(project.id);
  await fetchScene(project.id, scene.id);
  failure = 412;
  await assert.rejects(saveScene(project.id, scene), ExternalChangeConflictError);
  failure = 500;
  await assert.rejects(saveScene(project.id, scene), /Rejected write/);
  failure = 0;
  await saveScene(project.id, scene);
  await saveProject(project);
  assert.deepEqual(sent.map(({ etag }) => etag), [
    '"scene-version"', '"scene-version"', '"scene-version"', '"project-version"',
  ]);
  assert.ok(sent[0].url.endsWith(`/scenes/${scene.id}`));
  assert.ok(sent[3].url.endsWith(`/${project.id}`));
});

test("successful saves refresh ETags; explicit force omits If-Match for only that request", async (t) => {
  const { project, scene } = makeProjectFixture("force-retry");
  let version = 0;
  const headers: Array<string | null> = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") headers.push(new Headers(init.headers).get("If-Match"));
    return json(scene, `"v${++version}"`);
  });
  await fetchScene(project.id, scene.id);
  await saveScene(project.id, scene);
  await saveScene(project.id, scene, { force: true });
  await saveScene(project.id, scene);
  assert.deepEqual(headers, ['"v1"', null, '"v3"']);
});

test("invalid domain data never reaches the network", async (t) => {
  const { project, scene } = makeProjectFixture("invalid-save");
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("invalid data must not be sent"));
  await assert.rejects(saveProject({ ...project, fps: 0 }));
  await assert.rejects(saveScene(project.id, { ...scene, durationInFrames: 0 }));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("aborted fetches preserve the accepted ETag and propagate cancellation", async (t) => {
  const { project, scene } = makeProjectFixture("aborted-refresh");
  const controller = new AbortController();
  const abortError = new DOMException("Cancelled", "AbortError");
  const headers: Array<string | null> = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.signal) {
      assert.strictEqual(init.signal, controller.signal);
      assert.equal(init.signal.aborted, true);
      throw abortError;
    }
    if (init?.method === "PUT") headers.push(new Headers(init.headers).get("If-Match"));
    return json(scene, '"accepted"');
  });
  await fetchScene(project.id, scene.id);
  controller.abort();
  await assert.rejects(fetchSceneResource(project.id, scene.id, { signal: controller.signal }), (error) => error === abortError);
  await saveScene(project.id, scene);
  assert.deepEqual(headers, ['"accepted"']);
});
