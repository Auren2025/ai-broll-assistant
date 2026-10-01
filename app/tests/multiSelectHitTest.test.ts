import assert from "node:assert/strict";
import { test } from "node:test";
import { ActiveSelection, Group, Point, Rect } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import {
  activeSelectionMemberHit,
  installMultiSelectHitTesting,
} from "../src/editor/multiSelectBorders.ts";

const neverDrill = () => false;

/**
 * Mirror the canvas's real multi-select flow: an empty ActiveSelection plus
 * add(), which converts members to group-relative coordinates (the
 * constructor-with-objects path skips that step and double-transforms).
 */
function select(...objects: FabricObject[]): ActiveSelection {
  const selection = new ActiveSelection([], {
    multiSelectionStacking: "selection-order",
  });
  selection.add(...objects);
  return selection;
}

test("point on a member hits", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100 }),
    new Rect({ left: 300, top: 0, width: 100, height: 100 }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(0, 0), neverDrill),
    true,
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(300, 0), neverDrill),
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
    activeSelectionMemberHit(selection.getObjects(), new Point(150, 0), neverDrill),
    false,
  );
});

test("rotated member hit follows its real diamond, not the bbox", () => {
  const selection = select(
    new Rect({ left: 500, top: 500, width: 100, height: 100, angle: 45 }),
  );
  // Inside the rotated diamond but outside the unrotated bounding box.
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(500, 435), neverDrill),
    true,
  );
  // Corner of the unrotated bounding box is outside the diamond.
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(450, 450), neverDrill),
    false,
  );
});

test("scaled member hit follows its scaled shape", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100, scaleX: 2 }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(90, 0), neverDrill),
    true,
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(150, 0), neverDrill),
    false,
  );
});

test("invisible member does not hit", () => {
  const selection = select(
    new Rect({ left: 0, top: 0, width: 100, height: 100, visible: false }),
  );
  assert.equal(
    activeSelectionMemberHit(selection.getObjects(), new Point(0, 0), neverDrill),
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
  installMultiSelectHitTesting(canvasLike as unknown as Canvas, {
    isDrillActiveGroup: neverDrill,
  });
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
  installMultiSelectHitTesting(canvasLike as unknown as Canvas, {
    isDrillActiveGroup: neverDrill,
  });
  const canvas = canvasLike as unknown as Canvas;
  assert.equal(canvas.findTarget({} as never).target, rect);
});

test("group member in a multi-select only hits on a visible child", () => {
  // Group frame spans 0..200 x 0..100, but its only child covers 0..100.
  // The 100..200 strip is empty frame: same strict rule as single-group.
  const group = new Group(
    [new Rect({ left: 0, top: 0, width: 100, height: 100 })],
    { left: 0, top: 0 },
  );
  const selection = select(
    group,
    new Rect({ left: 300, top: 0, width: 100, height: 100 }),
  );
  const members = selection.getObjects();
  // On the group's child: hits.
  assert.equal(
    activeSelectionMemberHit(members, new Point(50, 50), neverDrill),
    true,
  );
  // On the group's empty frame (inside its bbox, not on a child): misses.
  // This is the reported bug: the hover cursor wrongly showed the drag
  // state here because the loose bbox check kept the ActiveSelection.
  assert.equal(
    activeSelectionMemberHit(members, new Point(150, 50), neverDrill),
    false,
  );
  // On the plain rect member: still hits.
  assert.equal(
    activeSelectionMemberHit(members, new Point(350, 50), neverDrill),
    true,
  );
});
