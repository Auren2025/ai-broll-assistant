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

test("cover zoom scales the image about the focal point", () => {
  // 100x100 frame, 200x100 image: cover base is 200x100 at scale 1.
  assert.deepEqual(imagePlacement("cover", 200, 100, 100, 100, 0.5, 0.5, 1), {
    x: -100,
    y: -50,
    width: 200,
    height: 100,
  });
  // zoom 2 -> 400x200, still anchored at the focal point.
  assert.deepEqual(imagePlacement("cover", 200, 100, 100, 100, 0.5, 0.5, 2), {
    x: -200,
    y: -100,
    width: 400,
    height: 200,
  });
  // Focal corner stays pinned while zooming: focalX=0 keeps the left edge.
  assert.deepEqual(imagePlacement("cover", 200, 100, 100, 100, 0, 0, 2), {
    x: -50,
    y: -50,
    width: 400,
    height: 200,
  });
});

test("zoom below 1 is treated as 1; fill and contain ignore zoom", () => {
  assert.deepEqual(imagePlacement("cover", 200, 100, 100, 100, 0.5, 0.5, 0.5), {
    x: -100,
    y: -50,
    width: 200,
    height: 100,
  });
  assert.deepEqual(imagePlacement("fill", 200, 100, 100, 100, 0.5, 0.5, 3), {
    x: -50,
    y: -50,
    width: 100,
    height: 100,
  });
  assert.deepEqual(imagePlacement("contain", 200, 100, 100, 100, 0.5, 0.5, 3), {
    x: -50,
    y: -25,
    width: 100,
    height: 50,
  });
});
