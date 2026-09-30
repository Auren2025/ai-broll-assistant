import assert from "node:assert/strict";
import { test } from "node:test";
import { imagePlacement } from "../src/editor/imagePlacement";

test("cover fills the frame and moves the crop toward the selected edge", () => {
  assert.deepEqual(imagePlacement("cover", 100, 100, 200, 100, 0.5, 0), {
    x: -100,
    y: -50,
    width: 200,
    height: 200,
  });
  assert.deepEqual(imagePlacement("cover", 100, 100, 200, 100, 0.5, 1), {
    x: -100,
    y: -150,
    width: 200,
    height: 200,
  });
});

test("contain centers the whole image; stretch uses the frame dimensions", () => {
  assert.deepEqual(imagePlacement("contain", 100, 100, 200, 100, 0, 0), {
    x: -50,
    y: -50,
    width: 100,
    height: 100,
  });
  assert.deepEqual(imagePlacement("fill", 100, 100, 200, 100, 0.5, 0.5), {
    x: -100,
    y: -50,
    width: 200,
    height: 100,
  });
});
