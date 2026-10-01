import { ActiveSelection, Group as FabricGroup } from "fabric";
import type { Canvas, FabricObject, Point } from "fabric";
import { findTopmostDrillChildAtPoint } from "./drillChildHitTest.ts";
import { isFabricObjectLocked } from "./fabricAdapter.ts";
import { paintLockedBorder, paintLockedXHandles } from "./lockedSelection.ts";

const MULTI_SELECT_BORDER_COLOR = "#0a84ff";

/**
 * Pure decision: is the scene point on any visible member of the
 * selection? The painted blue borders and this hit test both use each
 * member's own coords, so what you see is what grabs.
 *
 * Group members use the same strict rule as single-group hit testing: the
 * point must land on a visible child, not just the group's frame. Without
 * this, hovering the empty frame of a grouped member keeps the whole
 * ActiveSelection as the hover target, and the cursor wrongly shows the
 * drag state even though the pointer is on empty canvas.
 */
export function activeSelectionMemberHit(
  members: ReadonlyArray<FabricObject>,
  point: Point,
  isDrillActiveGroup: (group: FabricObject) => boolean,
): boolean {
  return members.some((member) => {
    if (!member.visible) return false;
    if (
      member instanceof FabricGroup &&
      !(member instanceof ActiveSelection) &&
      !isDrillActiveGroup(member)
    ) {
      return (
        findTopmostDrillChildAtPoint(member.getObjects(), point) !== undefined
      );
    }
    return member.containsPoint(point);
  });
}

/**
 * Per-member hit testing for multi-select, installed once per canvas. The
 * ActiveSelection's common box also covers the gaps between members, but
 * those gaps must behave as empty canvas (Keynote-like): when findTarget
 * lands on an ActiveSelection, keep it only if the pointer is actually on
 * a member. Otherwise report no target, so a gap click clears the
 * selection (or starts a rubber-band select) instead of dragging it.
 */
export function installMultiSelectHitTesting(
  canvas: Canvas,
  opts: { isDrillActiveGroup: (group: FabricObject) => boolean },
): void {
  const findTarget = canvas.findTarget.bind(canvas);
  canvas.findTarget = (e) => {
    const info = findTarget(e);
    const target = info.target;
    if (target instanceof ActiveSelection) {
      const hit = activeSelectionMemberHit(
        target.getObjects(),
        canvas.getScenePoint(e),
        opts.isDrillActiveGroup,
      );
      if (!hit) return { ...info, target: undefined };
    }
    return info;
  };
}

/**
 * Keynote-style multi-select visuals: no common outer frame. Each member
 * of the ActiveSelection paints its own thin blue border with white square
 * handles, matching the single-selection look. Locked members paint the
 * Keynote locked style instead: gray border with X handles. Called from
 * after:render.
 *
 * The painted handles are visual only: the ActiveSelection itself renders
 * no chrome (its hasBorders/hasControls are false) and exists purely so
 * the members move together. Press-drag on a member moves the whole
 * selection; resizing an individual member needs it selected on its own.
 */
export function paintMultiSelectBorders(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
): void {
  const active = canvas.getActiveObject();
  if (!(active instanceof ActiveSelection)) return;
  for (const member of active.getObjects()) {
    if (!member.visible) continue;
    if (isFabricObjectLocked(member)) {
      paintLockedBorder(ctx, member);
      paintLockedXHandles(ctx, canvas, member);
    } else {
      member._renderControls(ctx, {
        borderColor: MULTI_SELECT_BORDER_COLOR,
        hasBorders: true,
        hasControls: true,
      });
    }
  }
}
