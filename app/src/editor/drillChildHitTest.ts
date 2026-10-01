import type { FabricObject, Point } from "fabric";

/**
 * Topmost-first sweep of a drilled group's children for the child under a
 * scene point. Uses the same guards as Fabric's own hit test
 * (visible + evented) and the same point-in-polygon check
 * (containsPoint), so it agrees with what Fabric would hit if no dimmed
 * outside object covered the point.
 *
 * While drilling, outside objects stay evented (so clicking them exits
 * drill-in) but a higher z-order lets them win Fabric's topmost hit test
 * even when the press lands on a drill child. The caller uses this sweep
 * to give the child underneath the press back to the drill group instead
 * of letting the outside object steal it.
 */
export function findTopmostDrillChildAtPoint(
  children: readonly FabricObject[],
  scenePoint: Point,
): FabricObject | undefined {
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!child.visible || !child.evented) continue;
    if (child.containsPoint(scenePoint)) return child;
  }
  return undefined;
}
