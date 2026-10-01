import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IMAGE_CROP_ZOOM_MAX,
  IMAGE_CROP_ZOOM_MIN,
  clampFocal,
  clampImageCropZoom,
} from "../src/editor/imageCrop";

test("clampImageCropZoom keeps zoom within [1, 8]", () => {
  assert.equal(clampImageCropZoom(1), 1);
  assert.equal(clampImageCropZoom(4), 4);
  assert.equal(clampImageCropZoom(0.5), IMAGE_CROP_ZOOM_MIN);
  assert.equal(clampImageCropZoom(100), IMAGE_CROP_ZOOM_MAX);
  assert.equal(clampImageCropZoom(Number.NaN), IMAGE_CROP_ZOOM_MIN);
  assert.equal(clampImageCropZoom(Number.POSITIVE_INFINITY), IMAGE_CROP_ZOOM_MIN);
});

test("clampFocal keeps the focal point within [0, 1]", () => {
  assert.equal(clampFocal(0.5), 0.5);
  assert.equal(clampFocal(-1), 0);
  assert.equal(clampFocal(2), 1);
  assert.equal(clampFocal(Number.NaN), 0.5);
});
