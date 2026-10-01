import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActiveSelection,
  FixedLayout,
  Group,
  LayoutManager,
  Point,
  Rect,
} from "fabric";
import type { Canvas, FabricObject } from "fabric";
import { installGroupHitTesting } from "../src/editor/groupHitTest.ts";

/**
 * App-like group: children stored group-relative (center origin), the group
 * object at its frame center — the same layout applyLayerToFabricObject
 * produces. Group frame: x=200, y=200, w=300, h=300.
 * Mirrors tests/drillChildHitTest.test.ts: FixedLayout so the Group
 * constructor doesn't re-base children, positions set after construction.
 */
function makeGroup(schemas: Array<{ x: number; y: number; w: number; h: number; visible?: boolean }>): Group {
  const frame = { x: 200, y: 200, width: 300, height: 300 };
  const toGroupRelativeCenter = (s: { x: number; y: number; w: number; h: number }) => ({
    left: s.x + s.w / 2 - frame.width / 2,
    top: s.y + s.h / 2 - frame.height / 2,
  });
  const children = schemas.map(
    (s) =>
      new Rect({
        ...toGroupRelativeCenter(s),
        width: s.w,
        height: s.h,
        originX: "center",
        originY: "center",
        visible: s.visible ?? true,
      }),
  );
  const group = new Group(children, {
    originX: "center",
    originY: "center",
    width: frame.width,
    height: frame.height,
    layoutManager: new LayoutManager(new FixedLayout()),
  });
  // applyLayerToFabricObject overwrites positions after construction.
  schemas.forEach((s, i) => children[i].set(toGroupRelativeCenter(s)));
  group.set({
    left: frame.x + frame.width / 2,
    top: frame.y + frame.height / 2,
  });
  group.setCoords();
  for (const child of children) child.setCoords();
  return group;
}

function installOn(
  foundTarget: FabricObject | undefined,
  scenePoint: Point,
  isDrillActiveGroup: (group: FabricObject) => boolean = () => false,
): Canvas {
  const found: { target?: FabricObject; subTargets: FabricObject[] } = {
    target: foundTarget,
    subTargets: [],
  };
  const canvasLike = {
    findTarget: () => found,
    getScenePoint: () => scenePoint,
  };
  installGroupHitTesting(canvasLike as unknown as Canvas, {
    isDrillActiveGroup,
  });
  return canvasLike as unknown as Canvas;
}

test("click on a group child keeps the group target", () => {
  // Children at schema (0,0,100,100) and (200,0,100,100): scene x 200..300
  // and 400..500, y 200..300. Gap between them: scene x 300..400.
  const group = makeGroup([
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 200, y: 0, w: 100, h: 100 },
  ]);
  const canvas = installOn(group, new Point(250, 250)); // on first child
  assert.equal(canvas.findTarget({} as never).target, group);
});

test("click on the group frame gap clears the target", () => {
  const group = makeGroup([
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 200, y: 0, w: 100, h: 100 },
  ]);
  const canvas = installOn(group, new Point(350, 250)); // the gap
  assert.equal(canvas.findTarget({} as never).target, undefined);
});

test("click on an invisible child clears the target", () => {
  const group = makeGroup([
    { x: 0, y: 0, w: 100, h: 100, visible: false },
  ]);
  const canvas = installOn(group, new Point(250, 250)); // where it would be
  assert.equal(canvas.findTarget({} as never).target, undefined);
});

test("drilled-in group is excluded: gap click keeps the target", () => {
  const group = makeGroup([
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 200, y: 0, w: 100, h: 100 },
  ]);
  const canvas = installOn(group, new Point(350, 250), (g) => g === group);
  assert.equal(canvas.findTarget({} as never).target, group);
});

test("non-group targets pass through untouched", () => {
  const rect = new Rect({ left: 0, top: 0, width: 100, height: 100 });
  const canvas = installOn(rect, new Point(999, 999));
  assert.equal(canvas.findTarget({} as never).target, rect);
});

test("ActiveSelection is not treated as a group", () => {
  const selection = new ActiveSelection([], {
    multiSelectionStacking: "selection-order",
  });
  // The group installer must leave ActiveSelection alone (the multi-select
  // installer owns it); a gap point keeps the original target here.
  const canvas = installOn(selection, new Point(999, 999));
  assert.equal(canvas.findTarget({} as never).target, selection);
});
