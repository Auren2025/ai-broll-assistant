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
  const directory = path.join(root, project.id);
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
    [f.sceneUrl, { ...f.scene, topic: "Edited" }, "scenes/scene-001.json"],
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
    [f.sceneUrl, { ...f.scene, topic: "Local" }, { ...f.scene, topic: "External" }, "scenes/scene-001.json"],
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
  for (const [url, updated] of [[f.projectUrl, { ...f.project, name: "Lost" }], [f.sceneUrl, { ...f.scene, topic: "Lost" }]] as const) {
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
  assert.equal(scene.startFrame, 90);
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
