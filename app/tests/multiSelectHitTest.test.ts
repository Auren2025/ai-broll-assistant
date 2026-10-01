import assert from "node:assert/strict";
import { test } from "node:test";
import { ActiveSelection, Point, Rect } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import {
  activeSelectionMemberHit,
  installMultiSelectHitTesting,
} from "../src/editor/multiSelectBorders.ts";

/**
 * Mirror the canvas's real multi-select flow: an empty ActiveSelection plus
 * add(), which converts members to group-relative coordinates (the
 * constructor-with-objects path skips that step and double-transforms).
 */
function select(...rects: Rect[]): ActiveSelection {
  const selection = new ActiveSelection([], {
    multiSelectionStacking: "selection-order",
  });
  selection.add(...rects);
  return selection;
}

test("point on a member hits", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100 }),
    new Rect({ left: 300, top: 0, width: 100, height: 100 }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(0, 0)),
    true,
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(300, 0)),
    true,
  );
});

test("point in the gap between separated members misses", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100 }),
    new Rect({ left: 300, top: 0, width: 100, height: 100 }),
  );
  // The ActiveSelection's common box spans x -50..350; the gap is 50..250.
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(150, 0)),
    false,
  );
});

test("rotated member hit follows its real diamond, not the bbox", () => {
  const selection = select(
    new Rect({ left: 500, top: 500, width: 100, height: 100, angle: 45 }),
  );
  // Inside the rotated diamond but outside the unrotated bounding box.
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(500, 435)),
    true,
  );
  // Corner of the unrotated bounding box is outside the diamond.
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(450, 450)),
    false,
  );
});

test("scaled member hit follows its scaled shape", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100, scaleX: 2 }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(90, 0)),
    true,
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(150, 0)),
    false,
  );
});

test("invisible member does not hit", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100, visible: false }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(0, 0)),
    false,
  );
});

test("installMultiSelectHitTesting clears the target for gap clicks", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100 }),
    new Rect({ left: 300, top: 0, width: 100, height: 100 }),
  );
  const found: { target?: FabricObject; subTargets: FabricObject[] } = {
    target: selection,
    subTargets: [],
  };
  let scenePoint = new Point(150, 0); // the gap between members
  const canvasLike = {
    findTarget: () => found,
    getScenePoint: () => scenePoint,
  };
  installMultiSelectHitTesting(canvasLike as unknown as Canvas);
  const canvas = canvasLike as unknown as Canvas;

  const gapInfo = canvas.findTarget({} as never);
  assert.equal(gapInfo.target, undefined);

  scenePoint = new Point(0, 0); // on the first member
  const memberInfo = canvas.findTarget({} as never);
  assert.equal(memberInfo.target, selection);
});

test("installMultiSelectHitTesting passes non-selection targets through", () => {
  const rect = new Rect({ left: 0, top: 0, width: 100, height: 100 });
  const found: { target?: FabricObject; subTargets: FabricObject[] } = {
    target: rect,
    subTargets: [],
  };
  const canvasLike = {
    findTarget: () => found,
    getScenePoint: () => new Point(999, 999),
  };
  installMultiSelectHitTesting(canvasLike as unknown as Canvas);
  const canvas = canvasLike as unknown as Canvas;
  assert.equal(canvas.findTarget({} as never).target, rect);
});
