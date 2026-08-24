import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMagicMovePath,
  getMagicMoveTranslationForEndpoint,
} from "../src/editor/magicMoveGeometry";

const layer = { x: 100, y: 200, width: 80, height: 40 };

function assertPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  assert.ok(Math.abs(actual.x - expected.x) < 0.000001);
  assert.ok(Math.abs(actual.y - expected.y) < 0.000001);
}

test("top-level Magic Move path starts at the layer center", () => {
  assert.deepEqual(getMagicMovePath(layer, { x: 30, y: -10 }), {
    start: { x: 140, y: 220 },
    end: { x: 170, y: 210 },
  });
});

test("top-level endpoint drag round-trips to the domain translation", () => {
  const path = getMagicMovePath(layer, { x: 30, y: -10 });
  assert.deepEqual(
    getMagicMoveTranslationForEndpoint(layer, path.end),
    { x: 30, y: -10 },
  );
});

test("a rotated parent maps child translation between local and scene axes", () => {
  const group = {
    x: 100,
    y: 100,
    width: 400,
    height: 400,
    rotation: 90,
  };
  const child = { x: 60, y: 120, width: 80, height: 40 };
  const path = getMagicMovePath(child, { x: 30, y: -10 }, group);

  assertPointClose(path.start, { x: 360, y: 200 });
  assertPointClose(path.end, { x: 370, y: 230 });
  assertPointClose(
    getMagicMoveTranslationForEndpoint(child, path.end, group),
    { x: 30, y: -10 },
  );
});

test("arbitrary group rotation preserves endpoint round trips", () => {
  const group = {
    x: 300,
    y: 120,
    width: 500,
    height: 320,
    rotation: 37,
  };
  const child = { x: 80, y: 45, width: 120, height: 90 };
  const translation = { x: -145.25, y: 83.5 };
  const path = getMagicMovePath(child, translation, group);
  assertPointClose(
    getMagicMoveTranslationForEndpoint(child, path.end, group),
    translation,
  );
});
