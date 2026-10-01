import assert from "node:assert/strict";
import { test } from "node:test";
import { FixedLayout, Group, LayoutManager, Point, Rect } from "fabric";
import { findTopmostDrillChildAtPoint } from "../src/editor/drillChildHitTest";

/**
 * Mirrors how the app positions grouped objects: the group object sits at
 * its schema frame center, children are stored group-relative
 * (child.x + child.width / 2 - group.width / 2, center origin), exactly
 * like applyLayerToFabricObject does after `new Group()` re-bases them.
 */
function makeAppLikeGroup() {
  // Group schema frame: x=200, y=200, w=300, h=300.
  const groupFrame = { x: 200, y: 200, width: 300, height: 300 };
  // Children schema rects are group-relative (top-left origin).
  const bottomSchema = { x: 0, y: 0, width: 100, height: 100 };
  const topSchema = { x: 50, y: 50, width: 100, height: 100 };
  const toGroupRelativeCenter = (schema: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ({
    left: schema.x + schema.width / 2 - groupFrame.width / 2,
    top: schema.y + schema.height / 2 - groupFrame.height / 2,
  });
  const bottom = new Rect({
    ...toGroupRelativeCenter(bottomSchema),
    width: bottomSchema.width,
    height: bottomSchema.height,
    originX: "center",
    originY: "center",
  });
  const top = new Rect({
    ...toGroupRelativeCenter(topSchema),
    width: topSchema.width,
    height: topSchema.height,
    originX: "center",
    originY: "center",
  });
  const group = new Group([bottom, top], {
    originX: "center",
    originY: "center",
    width: groupFrame.width,
    height: groupFrame.height,
    layoutManager: new LayoutManager(new FixedLayout()),
  });
  // applyLayerToFabricObject overwrites positions after construction.
  bottom.set(toGroupRelativeCenter(bottomSchema));
  top.set(toGroupRelativeCenter(topSchema));
  group.set({
    left: groupFrame.x + groupFrame.width / 2,
    top: groupFrame.y + groupFrame.height / 2,
  });
  bottom.setCoords();
  top.setCoords();
  group.setCoords();
  // Scene layout: bottom spans (200..300), top spans (250..350).
  return { group, bottom, top };
}

test("point in the overlap returns the topmost child", () => {
  const { group, top } = makeAppLikeGroup();
  const hit = findTopmostDrillChildAtPoint(
    group.getObjects(),
    new Point(275, 275),
  );
  assert.equal(hit, top);
});

test("point only inside the bottom child returns the bottom child", () => {
  const { group, bottom } = makeAppLikeGroup();
  const hit = findTopmostDrillChildAtPoint(
    group.getObjects(),
    new Point(225, 225),
  );
  assert.equal(hit, bottom);
});

test("point outside every child returns undefined", () => {
  const { group } = makeAppLikeGroup();
  const hit = findTopmostDrillChildAtPoint(
    group.getObjects(),
    new Point(100, 100),
  );
  assert.equal(hit, undefined);
});

test("invisible topmost child is skipped", () => {
  const { group, bottom, top } = makeAppLikeGroup();
  top.visible = false;
  const hit = findTopmostDrillChildAtPoint(
    group.getObjects(),
    new Point(275, 275),
  );
  assert.equal(hit, bottom);
});

test("non-evented topmost child is skipped", () => {
  const { group, bottom, top } = makeAppLikeGroup();
  top.evented = false;
  const hit = findTopmostDrillChildAtPoint(
    group.getObjects(),
    new Point(275, 275),
  );
  assert.equal(hit, bottom);
});
