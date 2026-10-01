import assert from "node:assert/strict";
import { test } from "node:test";
import { fitFrameToImageSize, matchingImageSize } from "../src/editor/imageSizing";

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

test("fitFrameToImageSize trims contain letterboxing", () => {
  // 400x300 frame, 1600x600 image: height is the limiting side.
  assert.deepEqual(fitFrameToImageSize(400, 300, 1600, 600), {
    width: 400,
    height: 150,
  });
  // Already tight: unchanged.
  assert.deepEqual(fitFrameToImageSize(400, 300, 800, 600), {
    width: 400,
    height: 300,
  });
  // Unusable dimensions -> null.
  assert.equal(fitFrameToImageSize(0, 300, 800, 600), null);
  assert.equal(fitFrameToImageSize(400, 300, 800, 0), null);
});
