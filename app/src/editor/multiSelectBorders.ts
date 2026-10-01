import { ActiveSelection } from "fabric";
import type { Canvas, FabricObject, Point } from "fabric";

const MULTI_SELECT_BORDER_COLOR = "#0a84ff";

/**
 * Pure decision: is the scene point on any visible member of the
 * selection? The painted blue borders and this hit test both use each
 * member's own coords, so what you see is what grabs.
 */
export function activeSelectionMemberHit(
  members: ReadonlyArray<Pick<FabricObject, "visible" | "containsPoint">>,
  point: Point,
): boolean {
  return members.some(
    (member) => member.visible && member.containsPoint(point),
  );
}

/**
 * Per-member hit testing for multi-select, installed once per canvas. The
 * ActiveSelection's common box also covers the gaps between members, but
 * those gaps must behave as empty canvas (Keynote-like): when findTarget
 * lands on an ActiveSelection, keep it only if the pointer is actually on
 * a member. Otherwise report no target, so a gap click clears the
 * selection (or starts a rubber-band select) instead of dragging it.
 */
export function installMultiSelectHitTesting(canvas: Canvas): void {
  const findTarget = canvas.findTarget.bind(canvas);
  canvas.findTarget = (e) => {
    const info = findTarget(e);
    const target = info.target;
    if (target instanceof ActiveSelection) {
      const hit = activeSelectionMemberHit(
        target.getObjects(),
        canvas.getScenePoint(e),
      );
      if (!hit) return { ...info, target: undefined };
    }
    return info;
  };
}

/**
 * Keynote-style multi-select visuals: no common outer frame. Each member
 * of the ActiveSelection paints its own thin blue border with white square
 * handles, matching the single-selection look. Called from after:render.
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
    member._renderControls(ctx, {
      borderColor: MULTI_SELECT_BORDER_COLOR,
      hasBorders: true,
      hasControls: true,
    });
  }
}
