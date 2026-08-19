import assert from "node:assert/strict";
import { test } from "node:test";
import { Rect } from "fabric";
import { createDimensionResizeControls } from "../src/editor/fabricDimensionControls";

function transformFor(
  target: Rect,
  corner: string,
  originX: "left" | "right",
  originY: "top" | "bottom",
) {
  return { target, corner, originX, originY };
}

function assertPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  assert.ok(Math.abs(actual.x - expected.x) < 0.000001);
  assert.ok(Math.abs(actual.y - expected.y) < 0.000001);
}

test("corner resize changes dimensions without temporary object scale", () => {
  const target = new Rect({ left: 50, top: 50, width: 100, height: 80 });
  target.controls = createDimensionResizeControls();

  const changed = target.controls.br.actionHandler(
    {} as MouseEvent,
    transformFor(target, "br", "left", "top") as never,
    220,
    180,
  );

  assert.equal(changed, true);
  assert.ok(target.width > 100);
  assert.ok(target.height > 80);
  assert.equal(target.scaleX, 1);
  assert.equal(target.scaleY, 1);
});

test("side resize changes only its assigned dimension", () => {
  const target = new Rect({ left: 50, top: 50, width: 100, height: 80 });
  target.controls = createDimensionResizeControls();

  target.controls.mr.actionHandler(
    {} as MouseEvent,
    transformFor(target, "mr", "left", "top") as never,
    220,
    90,
  );

  assert.ok(target.width > 100);
  assert.equal(target.height, 80);
  assert.equal(target.scaleX, 1);
  assert.equal(target.scaleY, 1);
});

test("rotated corner resize restores the opposite anchor before resizing fires", () => {
  const target = new Rect({
    left: 180,
    top: 140,
    width: 120,
    height: 90,
    angle: 37,
  });
  target.controls = createDimensionResizeControls();
  const anchorBefore = target.getPositionByOrigin("left", "top");
  let anchorDuringEvent: { x: number; y: number } | null = null;
  target.on("resizing", () => {
    anchorDuringEvent = target.getPositionByOrigin("left", "top");
  });

  target.controls.br.actionHandler(
    {} as MouseEvent,
    transformFor(target, "br", "left", "top") as never,
    360,
    320,
  );

  const anchorAfter = target.getPositionByOrigin("left", "top");
  assert.ok(anchorDuringEvent);
  assertPointClose(anchorDuringEvent as { x: number; y: number }, anchorBefore);
  assertPointClose(anchorAfter, anchorBefore);
  assert.equal(target.scaleX, 1);
  assert.equal(target.scaleY, 1);
});
