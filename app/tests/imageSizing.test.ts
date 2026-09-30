import assert from "node:assert/strict";
import { test } from "node:test";
import { matchingImageSize } from "../src/editor/imageSizing";

test("setting image width computes height from its source ratio", () => {
  assert.deepEqual(matchingImageSize("width", 500, 16 / 9), {
    width: 500,
    height: 281.25,
  });
});

test("setting image height computes width from its source ratio", () => {
  assert.deepEqual(matchingImageSize("height", 300, 4 / 3), {
    width: 400,
    height: 300,
  });
});
