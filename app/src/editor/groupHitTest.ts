import { ActiveSelection, Group as FabricGroup } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import { findTopmostDrillChildAtPoint } from "./drillChildHitTest.ts";

/**
 * Keynote-style group hit testing, installed once per canvas. A group's
 * bounding box also covers the empty gaps between its children, but those
 * gaps must behave as empty canvas: when findTarget lands on a group, keep
 * it only if the pointer is actually on one of its children (the same rule
 * as multi-select member hit testing). Otherwise report no target, so a
 * gap click clears the selection (or starts a rubber-band select) instead
 * of selecting/dragging the group.
 *
 * The group currently being drilled into is excluded via isDrillActiveGroup:
 * while drilling, a blank inside the group frame keeps its drill semantics
 * (handled by the drill-in logic, which must still see the group target).
 */
export function installGroupHitTesting(
  canvas: Canvas,
  opts: { isDrillActiveGroup: (group: FabricObject) => boolean },
): void {
  const findTarget = canvas.findTarget.bind(canvas);
  canvas.findTarget = (e) => {
    const info = findTarget(e);
    const target = info.target;
    // ActiveSelection extends Group: the multi-select installer owns it.
    if (
      target instanceof FabricGroup &&
      !(target instanceof ActiveSelection) &&
      !opts.isDrillActiveGroup(target)
    ) {
      const hit = findTopmostDrillChildAtPoint(
        target.getObjects(),
        canvas.getScenePoint(e),
      );
      if (!hit) return { ...info, target: undefined };
    }
    return info;
  };
}
