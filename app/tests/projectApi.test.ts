import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchProjectResource,
  saveProject,
  uploadImageAsset,
} from "../src/api/projectApi";
import { MAX_IMAGE_ASSET_BYTES } from "../src/imageAssetPolicy";

const project = {
  schemaVersion: 1,
  id: "etag-transaction-test",
  name: "ETag transaction test",
  width: 1920,
  height: 1080,
  fps: 30,
  scenes: [{ id: "scene-001", file: "scenes/scene-001.json" }],
} as const;

test("fetched resource ETags are committed only after the caller accepts the snapshot", async () => {
  const originalFetch = globalThis.fetch;
  const ifMatchHeaders: Array<string | null> = [];
  let requestCount = 0;

  globalThis.fetch = (async (_input, init) => {
    requestCount += 1;
    ifMatchHeaders.push(new Headers(init?.headers).get("If-Match"));
    return new Response(JSON.stringify(project), {
      status: 200,
      headers: requestCount === 1 ? { ETag: '"disk-v1"' } : undefined,
    });
  }) as typeof fetch;

  try {
    const resource = await fetchProjectResource(project.id);
    await saveProject(resource.data);
    resource.commitEtag();
    await saveProject(resource.data);

    assert.deepEqual(ifMatchHeaders, [null, null, '"disk-v1"']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image upload rejects files above the shared size limit before fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const oversizedFile = {
      type: "image/png",
      size: MAX_IMAGE_ASSET_BYTES + 1,
    } as Blob;

    await assert.rejects(
      uploadImageAsset("demo", oversizedFile, "large.png"),
      /64 MiB upload limit/,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
