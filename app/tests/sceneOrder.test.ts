import assert from "node:assert/strict";
import { test } from "node:test";
import { moveSceneReference } from "../src/domain/sceneOrder";

const references = ["a", "b", "c", "d"].map((id) => ({ id, file: `scenes/${id}.json` }));

test("dragging a page inserts it above or below any other page", () => {
  assert.deepEqual(moveSceneReference(references, "a", 3)?.map(({ id }) => id), ["b", "c", "a", "d"]);
  assert.deepEqual(moveSceneReference(references, "d", 1)?.map(({ id }) => id), ["a", "d", "b", "c"]);
  assert.deepEqual(moveSceneReference(references, "b", 4)?.map(({ id }) => id), ["a", "c", "d", "b"]);
  assert.deepEqual(references.map(({ id }) => id), ["a", "b", "c", "d"]);
});

test("dropping onto the same boundary or an invalid target does nothing", () => {
  assert.equal(moveSceneReference(references, "b", 1), null);
  assert.equal(moveSceneReference(references, "b", 2), null);
  assert.equal(moveSceneReference(references, "missing", 3), null);
  assert.equal(moveSceneReference(references, "b", 5), null);
});
