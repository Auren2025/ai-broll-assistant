import assert from "node:assert/strict";
import { test } from "node:test";
import { getShapeTextContentBox } from "../src/domain/shapeTextLayout";

test("shape text content box applies uniform padding", () => {
  assert.deepEqual(getShapeTextContentBox(200, 100, 12), {
    x: 12,
    y: 12,
    width: 176,
    height: 76,
  });
});

test("shape text padding is clamped without producing negative dimensions", () => {
  assert.deepEqual(getShapeTextContentBox(30, 20, 40), {
    x: 15,
    y: 10,
    width: 0,
    height: 0,
  });
});
