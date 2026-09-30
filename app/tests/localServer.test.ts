import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { PathLike } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { createLocalServer } from "../server/index";
import { parseProject } from "../src/domain/projectSchema";
import { parseScene } from "../src/domain/sceneSchema";
import { makeProjectFixture } from "./helpers/projectFixture";

const EDITOR_ORIGIN = "http://127.0.0.1:5174";
const RENDER_ORIGIN = "http://localhost:3003";

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  assert.ok(body !== null && typeof body === "object" && !Array.isArray(body));
  return body as Record<string, unknown>;
}

async function responseError(response: Response): Promise<string> {
  const { error } = await responseObject(response);
  assert.ok(typeof error === "string");
  return error;
}

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "ai-broll-http-"));
  const server = createLocalServer(root);
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await fs.rm(root, { recursive: true, force: true });
  });
  // Expected invalid requests/files are asserted below without dumping Zod stacks.
  t.mock.method(console, "error", () => {});
  const { project, scene, secondScene } = makeProjectFixture();
  const directory = path.join(root, "broll", project.id);
  await fs.mkdir(path.join(directory, "scenes"), { recursive: true });
  await fs.mkdir(path.join(directory, "assets"));
  await fs.writeFile(path.join(directory, "project.json"), JSON.stringify(project));
  for (const value of [scene, secondScene]) {
    await fs.writeFile(path.join(directory, "scenes", `${value.id}.json`), JSON.stringify(value));
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const projectUrl = `/api/projects/${project.id}`;
  const sceneUrl = `${projectUrl}/scenes/${scene.id}`;
  const request = (url: string, init?: RequestInit) => fetch(`${base}${url}`, {
    ...init, signal: AbortSignal.timeout(3000),
  });
  const write = (url: string, body: unknown, etag?: string | null, origin = EDITOR_ORIGIN) => request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: origin, ...(etag ? { "If-Match": etag } : {}) },
    body: JSON.stringify(body),
  });
  const readProject = async () => parseProject(JSON.parse(await fs.readFile(path.join(directory, "project.json"), "utf8")));
  const readScene = async (id = scene.id) => parseScene(JSON.parse(await fs.readFile(path.join(directory, "scenes", `${id}.json`), "utf8")));
  return { project, scene, secondScene, root, directory, projectUrl, sceneUrl, request, write, readProject, readScene };
}

test("local server reads validated resources, health and ETags from an isolated root", async (t) => {
  const f = await fixture(t);
  const health = await f.request("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  for (const [url, expected] of [[f.projectUrl, f.project], [f.sceneUrl, f.scene]] as const) {
    const response = await f.request(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("ETag") ?? "", /^"[a-f0-9]{64}"$/);
    assert.deepEqual(await response.json(), expected);
  }
});

test("local server reads slide projects without changing their project IDs", async (t) => {
  const f = await fixture(t);
  const slideDirectory = path.join(f.root, "slide", "slide-demo");
  await fs.mkdir(path.join(slideDirectory, "scenes"), { recursive: true });
  const slideProject = { ...f.project, id: "slide-demo", kind: "slide" as const, scenes: f.project.scenes.map(({ id, file }) => ({ id, file })) };
  await fs.writeFile(path.join(slideDirectory, "project.json"), JSON.stringify(slideProject));
  await fs.writeFile(path.join(slideDirectory, "scenes", `${f.scene.id}.json`), JSON.stringify(f.scene));
  const response = await f.request("/api/projects/slide-demo");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), slideProject);
  const sceneResponse = await f.request(`/api/projects/slide-demo/scenes/${f.scene.id}`);
  assert.equal(sceneResponse.status, 200);
  assert.deepEqual(await sceneResponse.json(), f.scene);
});

test("a project cannot change type without moving its directory", async (t) => {
  const f = await fixture(t);
  const response = await f.write(f.projectUrl, { ...f.project, kind: "slide", scenes: f.project.scenes.map(({ id, file }) => ({ id, file })) });
  assert.equal(response.status, 400);
  assert.match(await responseError(response), /kind does not match/);
  assert.deepEqual(await f.readProject(), f.project);
});

test("slide pages can be inserted and reordered without changing page content or timeline anchors", async (t) => {
  const f = await fixture(t);
  const directory = path.join(f.root, "slide", "slide-order");
  await fs.mkdir(path.join(directory, "scenes"), { recursive: true });
  const project = { ...f.project, id: "slide-order", kind: "slide" as const, scenes: f.project.scenes.map(({ id, file }) => ({ id, file })) };
  await fs.writeFile(path.join(directory, "project.json"), JSON.stringify(project));
  for (const scene of [f.scene, f.secondScene]) {
    await fs.writeFile(path.join(directory, "scenes", `${scene.id}.json`), JSON.stringify(scene));
  }
  const url = "/api/projects/slide-order";
  const created = await f.request(`${url}/scenes?index=1`, { method: "POST", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(created.status, 201);
  const body = await responseObject(created);
  const inserted = parseScene(body.scene);
  assert.equal(inserted.schemaVersion, 2);
  assert.equal(inserted.startFrame, undefined);
  const updated = parseProject(body.project);
  assert.deepEqual(updated.scenes.map(({ id }) => id), ["scene-001", "scene-003", "scene-002"]);
  assert.deepEqual(updated.scenes.map(({ startFrame }) => startFrame), [undefined, undefined, undefined]);
  const reordered = { ...updated, scenes: [updated.scenes[2], updated.scenes[0], updated.scenes[1]] };
  const saved = await f.write(url, reordered);
  assert.equal(saved.status, 200);
  assert.deepEqual((await responseObject(saved)).scenes, reordered.scenes);
  assert.deepEqual(parseScene(JSON.parse(await fs.readFile(path.join(directory, "scenes", "scene-001.json"), "utf8"))), f.scene);
});

test("server instances keep their injected project roots isolated", async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  const response = await first.write(first.projectUrl, { ...first.project, name: "First instance only" });
  assert.equal(response.status, 200);
  await response.json();
  assert.equal((await first.readProject()).name, "First instance only");
  assert.deepEqual(await second.readProject(), second.project);
  const other = await second.request(second.projectUrl);
  assert.deepEqual(await other.json(), second.project);
});

test("project and scene PUT persist validated JSON and return fresh ETags without temp leftovers", async (t) => {
  const f = await fixture(t);
  for (const [url, updated, filename] of [
    [f.projectUrl, { ...f.project, name: "Renamed" }, "project.json"],
    [f.sceneUrl, { ...f.scene, name: "Edited" }, "scenes/scene-001.json"],
  ] as const) {
    const original = await f.request(url);
    await original.json();
    const response = await f.write(url, updated, original.headers.get("ETag"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), EDITOR_ORIGIN);
    assert.notEqual(response.headers.get("ETag"), original.headers.get("ETag"));
    assert.deepEqual(await response.json(), updated);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.directory, filename), "utf8")), updated);
  }
  for (const directory of [f.directory, path.join(f.directory, "scenes")]) {
    assert.equal((await fs.readdir(directory)).some((name) => name.includes(".tmp-")), false);
  }
});

test("external project and scene edits reject stale ETags without overwriting disk; reload permits retry", async (t) => {
  const f = await fixture(t);
  for (const [url, local, external, filename] of [
    [f.projectUrl, { ...f.project, name: "Local" }, { ...f.project, name: "External" }, "project.json"],
    [f.sceneUrl, { ...f.scene, name: "Local" }, { ...f.scene, name: "External" }, "scenes/scene-001.json"],
  ] as const) {
    const original = await f.request(url);
    await original.json();
    const file = path.join(f.directory, filename);
    const externalBytes = JSON.stringify(external, null, 2);
    await fs.writeFile(file, externalBytes);
    const rejected = await f.write(url, local, original.headers.get("ETag"));
    assert.equal(rejected.status, 412);
    assert.deepEqual(await rejected.json(), { error: "File changed on disk" });
    assert.equal(await fs.readFile(file, "utf8"), externalBytes);
    const reload = await f.request(url);
    assert.deepEqual(await reload.json(), external);
    const retry = await f.write(url, local, reload.headers.get("ETag"));
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), local);
  }
});

test("malformed JSON, unknown fields and route ID mismatches cannot modify resources", async (t) => {
  const f = await fixture(t);
  for (const [url, original] of [[f.projectUrl, f.project], [f.sceneUrl, f.scene]] as const) {
    for (const value of [{ ...original, unexpected: true }, { ...original, id: "wrong-id" }]) {
      const response = await f.write(url, value);
      assert.equal(response.status, 400);
      await response.json();
    }
    const malformed = await f.request(url, {
      method: "PUT", headers: { Origin: EDITOR_ORIGIN, "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(malformed.status, 400);
    await malformed.json();
  }
  assert.deepEqual(await f.readProject(), f.project);
  assert.deepEqual(await f.readScene(), f.scene);
});

test("missing, corrupt and schema-invalid disk data return explicit errors", async (t) => {
  const f = await fixture(t);
  const missing = await f.request("/api/projects/missing-project");
  assert.equal(missing.status, 404);
  await missing.json();
  await fs.unlink(path.join(f.directory, "scenes/scene-001.json"));
  const missingScene = await f.request(f.sceneUrl);
  assert.equal(missingScene.status, 404);
  await missingScene.json();
  for (const [url, file] of [[f.sceneUrl, "scenes/scene-001.json"], [f.projectUrl, "project.json"]]) {
    for (const content of ["{", "{}"]) {
      await fs.writeFile(path.join(f.directory, file), content);
      const response = await f.request(url);
      assert.equal(response.status, 500);
      assert.match(await responseError(response), /Invalid .* data/);
    }
  }
});

test("encoded traversal and malformed resource identifiers are rejected", async (t) => {
  const f = await fixture(t);
  for (const url of [
    "/api/projects/%2e%2e%2foutside",
    `${f.projectUrl}/scenes/..%2foutside`,
    `${f.projectUrl}/assets/..%2fproject.json`,
  ]) {
    const response = await f.request(url);
    assert.equal(response.status, 400);
    await response.json();
  }
  assert.deepEqual(await f.readProject(), f.project);
});

test("failed atomic replacement reports failure and leaves original project/scene bytes intact", async (t) => {
  const f = await fixture(t);
  const rename = fs.rename;
  const targets = [path.join(f.directory, "project.json"), path.join(f.directory, "scenes/scene-001.json")];
  const originalBytes = await Promise.all(targets.map((file) => fs.readFile(file)));
  t.mock.method(fs, "rename", async (from: string, to: string) => {
    if (targets.includes(String(to))) throw Object.assign(new Error("simulated rename failure"), { code: "EACCES" });
    return rename(from, to);
  });
  for (const [url, updated] of [[f.projectUrl, { ...f.project, name: "Lost" }], [f.sceneUrl, { ...f.scene, name: "Lost" }]] as const) {
    const response = await f.write(url, updated);
    assert.equal(response.status, 500);
    assert.match(await responseError(response), /Failed to save/);
  }
  assert.deepEqual(await f.readProject(), f.project);
  assert.deepEqual(await f.readScene(), f.scene);
  assert.deepEqual(await Promise.all(targets.map((file) => fs.readFile(file))), originalBytes);
  for (const directory of [f.directory, path.join(f.directory, "scenes")]) {
    assert.equal((await fs.readdir(directory)).some((name) => name.includes(".tmp-")), false);
  }
});

test("scene creation and deletion preserve remaining IDs, contents and absolute time anchors", async (t) => {
  const f = await fixture(t);
  const created = await f.request(`${f.projectUrl}/scenes`, { method: "POST", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(created.status, 201);
  const body = await responseObject(created);
  const scene = parseScene(body.scene);
  assert.equal(scene.id, "scene-003");
  assert.equal(scene.startFrame, undefined);
  assert.equal(parseProject(body.project).scenes.at(-1)?.startFrame, 90);
  assert.deepEqual(scene.layers, []);
  assert.deepEqual(await f.readProject(), parseProject(body.project));
  assert.deepEqual(await f.readScene(scene.id), scene);
  const deleted = await f.request(f.sceneUrl, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(deleted.status, 200);
  const remaining = parseProject(await deleted.json());
  assert.deepEqual(remaining.scenes.map(({ id }) => id), ["scene-002", "scene-003"]);
  assert.deepEqual(await f.readScene("scene-002"), f.secondScene);
  assert.deepEqual(await f.readScene("scene-003"), scene);
  await assert.rejects(fs.access(path.join(f.directory, "scenes/scene-001.json")), { code: "ENOENT" });
});

test("scene duplication clones content with fresh ids and inserts after the source", async (t) => {
  const f = await fixture(t);
  const textLayerFixture = (id: string, zIndex: number, text: string) => ({
    id,
    name: id,
    type: "text" as const,
    x: 10,
    y: 20,
    width: 400,
    height: 100,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal" as const,
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    text,
    fontFamily: "Arial",
    fontSize: 48,
    fontWeight: 700,
    fontStyle: "normal" as const,
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: "center" as const,
    verticalAlign: "middle" as const,
    autoResize: "both" as const,
    textCase: "normal" as const,
    kerningPairs: true,
    ligatures: true,
    fill: "#ffffff",
    fillEnabled: true,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside" as const,
  });
  const layered = parseScene({
    ...JSON.parse(JSON.stringify(f.scene)),
    layers: [textLayerFixture("text-7", 1, "Hello"), textLayerFixture("text-3", 0, "World")],
  });
  const created = await f.write(
    f.sceneUrl,
    layered,
    (await f.request(f.sceneUrl)).headers.get("ETag"),
  );
  assert.equal(created.status, 200);

  const duplicated = await f.request(`${f.projectUrl}/scenes/${f.scene.id}/duplicate`, {
    method: "POST",
    headers: { Origin: EDITOR_ORIGIN },
  });
  assert.equal(duplicated.status, 201);
  const body = await responseObject(duplicated);
  const scene = parseScene(body.scene);
  assert.equal(scene.id, "scene-003");
  assert.equal(scene.name, "First scene copy");
  assert.equal(scene.durationInFrames, layered.durationInFrames);

  const project = parseProject(body.project);
  assert.deepEqual(
    project.scenes.map(({ id }) => id),
    ["scene-001", "scene-003", "scene-002"],
  );

  // Layers are cloned with the same visual content but fresh ids.
  assert.equal(scene.layers.length, 2);
  const [firstLayer, secondLayer] = scene.layers;
  assert.equal(firstLayer.type, "text");
  assert.equal(firstLayer.id, "text-1");
  assert.equal(secondLayer.type, "text");
  assert.equal(secondLayer.id, "text-2");
  if (firstLayer.type === "text" && secondLayer.type === "text") {
    assert.equal(firstLayer.text, "Hello");
    assert.equal(secondLayer.text, "World");
    assert.equal(firstLayer.zIndex, 1);
    assert.equal(secondLayer.zIndex, 0);
  }

  // Persisted files match the response; the source scene is untouched.
  assert.deepEqual(await f.readScene(scene.id), scene);
  assert.deepEqual(await f.readProject(), project);
  assert.deepEqual(await f.readScene(), layered);

  // Duplicating an unknown scene id is a 404.
  const missing = await f.request(`${f.projectUrl}/scenes/scene-999/duplicate`, {
    method: "POST",
    headers: { Origin: EDITOR_ORIGIN },
  });
  assert.equal(missing.status, 404);
  await responseError(missing);
});

test("the last scene cannot be deleted", async (t) => {
  const f = await fixture(t);
  const first = await f.request(`${f.projectUrl}/scenes/scene-002`, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(first.status, 200);
  const remaining = await first.json();
  const rejected = await f.request(f.sceneUrl, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(rejected.status, 409);
  await rejected.json();
  assert.deepEqual(await f.readProject(), remaining);
  assert.deepEqual(await f.readScene(), f.scene);
});

test("scene creation rolls back its new file if updating project references fails", async (t) => {
  const f = await fixture(t);
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (from: string, to: string) => {
    if (String(to) === path.join(f.directory, "project.json")) throw new Error("simulated project write failure");
    return rename(from, to);
  });
  const response = await f.request(`${f.projectUrl}/scenes`, { method: "POST", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(response.status, 500);
  await response.json();
  assert.deepEqual(await f.readProject(), f.project);
  assert.deepEqual((await fs.readdir(path.join(f.directory, "scenes"))).sort(), ["scene-001.json", "scene-002.json"]);
  assert.equal((await fs.readdir(f.directory)).some((name) => name.includes(".tmp-")), false);
});

test("scene deletion tolerates a missing scene file without leaving project.json half updated", async (t) => {
  const f = await fixture(t);
  await fs.unlink(path.join(f.directory, "scenes/scene-001.json"));
  const response = await f.request(f.sceneUrl, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(response.status, 200);
  assert.deepEqual(parseProject(await response.json()).scenes.map(({ id }) => id), ["scene-002"]);
});

test("scene deletion that succeeds for the file but fails to write project.json is reported", async (t) => {
  const f = await fixture(t);
  const projectBytesBefore = await fs.readFile(path.join(f.directory, "project.json"));
  const writeFile = fs.writeFile;
  const tempPattern = /\.tmp-\d+-\d+-[a-z0-9]+$/;
  t.mock.method(fs, "writeFile", (async (file: PathLike, data: Parameters<typeof fs.writeFile>[1], options?: Parameters<typeof fs.writeFile>[2]) => {
    if (tempPattern.test(String(file))) {
      throw Object.assign(new Error("simulated project write failure"), { code: "EACCES" });
    }
    return writeFile(file, data, options);
  }) as typeof fs.writeFile);
  const response = await f.request(f.sceneUrl, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(response.status, 500);
  assert.equal(await responseError(response), "Failed to update project");
  assert.deepEqual(await fs.readFile(path.join(f.directory, "project.json")), projectBytesBefore);
  await assert.rejects(fs.access(path.join(f.directory, "scenes/scene-001.json")), { code: "ENOENT" });
});

test("untrusted browser origins cannot read or write, with and without an Origin header", async (t) => {
  const f = await fixture(t);
  for (const method of ["GET", "PUT", "POST", "DELETE"]) {
    const requestInit: RequestInit = method === "GET" || method === "DELETE"
      ? { method, headers: { Origin: "https://untrusted.invalid" } }
      : { method, headers: { Origin: "https://untrusted.invalid", "Content-Type": "application/json" },
        body: JSON.stringify(method === "DELETE" ? null : { ...f.project, name: "Untrusted" }) };
    const response = await f.request(f.projectUrl, requestInit);
    assert.equal(response.status, 403);
    assert.equal(await responseError(response), "Origin not allowed");
  }
  assert.equal((await f.request(f.projectUrl, { method: "PUT", body: "{}" })).status, 400);
  assert.deepEqual(await f.readProject(), f.project);
});

test("same-origin writes still succeed and the editor's origin receives CORS headers", async (t) => {
  const f = await fixture(t);
  const response = await f.write(f.projectUrl, { ...f.project, name: "Same-origin" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), EDITOR_ORIGIN);
  assert.equal(response.headers.get("Vary"), "Origin");
  assert.equal((await f.readProject()).name, "Same-origin");
});

test("the Remotion render origin can read projects but cannot write them", async (t) => {
  const f = await fixture(t);
  const readResponse = await f.request(f.projectUrl, {
    headers: { Origin: RENDER_ORIGIN },
  });
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.headers.get("Access-Control-Allow-Origin"), RENDER_ORIGIN);

  const writeResponse = await f.request(f.projectUrl, {
    method: "PUT",
    headers: { Origin: RENDER_ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ ...f.project, name: "Render write" }),
  });
  assert.equal(writeResponse.status, 403);
  assert.equal(await responseError(writeResponse), "Origin not allowed");
  assert.deepEqual(await f.readProject(), f.project);
});

test("non-browser callers without an Origin header still reach the write handlers", async (t) => {
  const f = await fixture(t);
  const response = await f.request(f.projectUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...f.project, name: "Local CLI" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal((await f.readProject()).name, "Local CLI");
});

test("scene deletion failure reports the error and leaves project.json and the scene file intact", async (t) => {
  const f = await fixture(t);
  const projectBytesBefore = await fs.readFile(path.join(f.directory, "project.json"));
  const sceneBytesBefore = await fs.readFile(path.join(f.directory, "scenes/scene-001.json"));
  const unlink = fs.unlink;
  t.mock.method(fs, "unlink", async (file: string) => {
    if (String(file) === path.join(f.directory, "scenes/scene-001.json")) {
      throw Object.assign(new Error("simulated delete failure"), { code: "EACCES" });
    }
    return unlink(file);
  });
  const response = await f.request(f.sceneUrl, { method: "DELETE", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(response.status, 500);
  assert.equal(await responseError(response), "Failed to delete scene file");
  assert.deepEqual(await f.readProject(), f.project);
  assert.deepEqual(await f.readScene(), f.scene);
  assert.deepEqual(await fs.readFile(path.join(f.directory, "project.json")), projectBytesBefore);
  assert.deepEqual(await fs.readFile(path.join(f.directory, "scenes/scene-001.json")), sceneBytesBefore);
});

const enterAnimation = (id: string, startFrame: number, durationInFrames: number) => ({
  id,
  startFrame,
  durationInFrames,
  easing: "linear" as const,
  phase: "enter" as const,
  preset: "dissolve-in" as const,
});

const textLayer = (id: string, zIndex: number, animations: ReturnType<typeof enterAnimation>[]) => ({
  id,
  name: id,
  type: "text" as const,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  rotation: 0,
  opacity: 1,
  opacityEnabled: true,
  blendMode: "normal" as const,
  zIndex,
  visible: true,
  locked: false,
  animations,
  text: "hello",
  fontFamily: "Arial",
  fontSize: 12,
  fontWeight: 400,
  fontStyle: "normal" as const,
  lineHeight: 1,
  letterSpacing: 0,
  textAlign: "center" as const,
  verticalAlign: "middle" as const,
  autoResize: "both" as const,
  textCase: "normal" as const,
  kerningPairs: true,
  ligatures: true,
  fill: "#000000",
  fillEnabled: true,
  stroke: null,
});

test("split scene divides durations, inserts the new scene, and prunes animations", async (t) => {
  const f = await fixture(t);
  const animated = {
    ...f.scene,
    durationInFrames: 30,
    layers: [
      textLayer("text-1", 0, [enterAnimation("a1", 0, 10)]),
      textLayer("text-2", 1, [enterAnimation("b1", 10, 10)]),
      textLayer("text-3", 2, [enterAnimation("c1", 20, 10)]),
    ],
  };
  const putResponse = await f.write(f.sceneUrl, animated);
  assert.equal(putResponse.status, 200);

  const response = await f.request(`${f.sceneUrl}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: EDITOR_ORIGIN },
    body: JSON.stringify({ splitFrame: 15 }),
  });
  assert.equal(response.status, 201);
  const body = await responseObject(response);

  const project = parseProject(body.project);
  assert.deepEqual(
    project.scenes.map((reference) => [reference.id, reference.startFrame]),
    [["scene-001", 0], ["scene-003", 15], ["scene-002", 60]],
  );

  const firstScene = parseScene(body.firstScene);
  assert.equal(firstScene.id, "scene-001");
  assert.equal(firstScene.durationInFrames, 15);
  assert.equal(firstScene.layers.length, 3);
  assert.deepEqual(
    firstScene.layers.map((layer) => layer.animations.map((animation) => [animation.startFrame, animation.durationInFrames])),
    [[[0, 10]], [], []],
  );

  const secondScene = parseScene(body.secondScene);
  assert.equal(secondScene.id, "scene-003");
  assert.equal(secondScene.name, "First scene (part 2)");
  assert.equal(secondScene.durationInFrames, 15);
  assert.deepEqual(
    secondScene.layers.map((layer) => layer.id),
    ["text-1", "text-2", "text-3"],
  );
  assert.deepEqual(
    secondScene.layers.map((layer) => layer.animations.map((animation) => [animation.startFrame, animation.durationInFrames])),
    [[], [], [[5, 10]]],
  );

  assert.equal(body.removedAnimationCount, 4);

  // On-disk state matches: seamless [0,15) + [15,30), later scenes untouched.
  assert.deepEqual(await f.readProject(), project);
  assert.deepEqual(await f.readScene("scene-001"), firstScene);
  assert.deepEqual(await f.readScene("scene-003"), secondScene);
});

test("split scene rejects split frames outside the scene", async (t) => {
  const f = await fixture(t);
  const split = (payload: unknown, method = "POST") => f.request(`${f.sceneUrl}/split`, {
    method,
    headers: { "Content-Type": "application/json", Origin: EDITOR_ORIGIN },
    body: JSON.stringify(payload),
  });

  for (const splitFrame of [0, 30, 45, -5, 7.5, "15", null]) {
    const response = await split({ splitFrame });
    assert.equal(response.status, 400, `splitFrame=${JSON.stringify(splitFrame)}`);
  }
  const missing = await split({});
  assert.equal(missing.status, 400);

  const unknownScene = await f.request(`${f.projectUrl}/scenes/nope/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: EDITOR_ORIGIN },
    body: JSON.stringify({ splitFrame: 15 }),
  });
  assert.equal(unknownScene.status, 404);

  const wrongMethod = await f.request(`${f.sceneUrl}/split`, {
    method: "GET",
    headers: { Origin: EDITOR_ORIGIN },
  });
  assert.equal(wrongMethod.status, 405);

  // Nothing changed on disk.
  assert.deepEqual(await f.readProject(), f.project);
  assert.deepEqual(await f.readScene(), f.scene);
});

test("split scene works for slide projects without timeline anchors", async (t) => {
  const f = await fixture(t);
  const slideProject = parseProject({
    schemaVersion: 2,
    id: "slide-project",
    kind: "slide",
    name: "Slide project",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
  });
  const slideScene = parseScene({
    schemaVersion: 2,
    id: "scene-001",
    name: "Slide page",
    durationInFrames: 30,
    layers: [textLayer("text-1", 0, [enterAnimation("a1", 5, 10)])],
  });
  const slideDir = path.join(f.root, "slide", slideProject.id);
  await fs.mkdir(path.join(slideDir, "scenes"), { recursive: true });
  await fs.writeFile(path.join(slideDir, "project.json"), JSON.stringify(slideProject));
  await fs.writeFile(path.join(slideDir, "scenes/scene-001.json"), JSON.stringify(slideScene));

  const response = await f.request(`/api/projects/${slideProject.id}/scenes/scene-001/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: EDITOR_ORIGIN },
    body: JSON.stringify({ splitFrame: 10 }),
  });
  assert.equal(response.status, 201);
  const body = await responseObject(response);
  const project = parseProject(body.project);
  assert.deepEqual(
    project.scenes.map((reference) => [reference.id, reference.startFrame]),
    [["scene-001", undefined], ["scene-002", undefined]],
  );
  const firstScene = parseScene(body.firstScene);
  const secondScene = parseScene(body.secondScene);
  assert.equal(firstScene.durationInFrames, 10);
  assert.equal(secondScene.durationInFrames, 20);
  // The animation straddles the split point, so it is dropped from both halves.
  assert.equal(firstScene.layers[0]?.animations.length, 0);
  assert.equal(secondScene.layers[0]?.animations.length, 0);
  assert.equal(body.removedAnimationCount, 2);
});

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:05,000 --> 00:00:07,000
Second line
`;

test("subtitles endpoint returns parsed cues, or an empty list without source.srt", async (t) => {
  const f = await fixture(t);
  const url = `${f.projectUrl}/subtitles`;

  const empty = await f.request(url);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { cues: [] });

  await fs.writeFile(path.join(f.directory, "source.srt"), SAMPLE_SRT);
  const response = await f.request(url);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cues: [
      { id: "cue-001", index: 1, startMs: 1000, endMs: 3500, text: "Hello world" },
      { id: "cue-002", index: 2, startMs: 5000, endMs: 7000, text: "Second line" },
    ],
  });

  const wrongMethod = await f.request(url, { method: "POST", headers: { Origin: EDITOR_ORIGIN } });
  assert.equal(wrongMethod.status, 405);

  await fs.writeFile(path.join(f.directory, "source.srt"), "not a subtitle file");
  const invalid = await f.request(url);
  assert.equal(invalid.status, 500);
  assert.equal(await responseError(invalid), "Invalid subtitle data");
});
