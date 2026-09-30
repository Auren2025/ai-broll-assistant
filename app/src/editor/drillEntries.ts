import type { GroupLayer } from "../domain/groupLayerSchema";
import type { Layer } from "../domain/sceneSchema";

/**
 * One row of what the canvas should render as a top-level object.
 *
 * When drilling into a group (`drillGroupId` set), the drilled group stays
 * a single FabricGroup on the canvas: its children are edited in place via
 * the group's interactive sub-targets, so nothing ever moves and the group
 * frame can stay visible as a boundary overlay. Every other top-level entry
 * is dimmed and non-interactive while drilling.
 */
export interface DrillEntry {
  layer: Layer;
  /** True when the entry is outside the drilled group and should be dimmed. */
  dimmed: boolean;
  /** True when the entry is the group currently drilled into. */
  drilled: boolean;
}

/** Fraction of the original opacity applied to layers outside the drilled group. */
export const DRILL_DIM_FACTOR = 0.35;

function findDrillGroup(
  layers: readonly Layer[],
  drillGroupId: string,
): GroupLayer | null {
  const group = layers.find((layer) => layer.id === drillGroupId) ?? null;
  return group?.type === "group" ? group : null;
}

/**
 * True when `layerId` is the drilled group itself or one of its children.
 * Used for hit-testing: clicks inside the drill scope keep drill-in mode,
 * clicks outside exit it.
 */
export function isLayerInDrillScope(
  layers: readonly Layer[],
  drillGroupId: string | null,
  layerId: string,
): boolean {
  if (!drillGroupId) return false;
  if (layerId === drillGroupId) return true;
  const group = findDrillGroup(layers, drillGroupId);
  return group?.children.some((child) => child.id === layerId) ?? false;
}

/**
 * Flatten the scene's top-level layers into canvas entries, in z-order.
 * Drilling never restructures the scene: the drilled group keeps its entry
 * (flagged `drilled`) and everything else is flagged `dimmed`.
 */
export function computeDrillEntries(
  layers: readonly Layer[],
  drillGroupId: string | null,
): DrillEntry[] {
  const drilling = drillGroupId !== null;
  const drillGroup = drilling ? findDrillGroup(layers, drillGroupId) : null;
  // A stale drill id (group deleted) renders as if not drilling.
  const effectiveDrillGroupId = drillGroup ? drillGroupId : null;
  return [...layers]
    .sort((first, second) => first.zIndex - second.zIndex)
    .map((layer) => ({
      layer,
      dimmed: effectiveDrillGroupId !== null && layer.id !== effectiveDrillGroupId,
      drilled: layer.id === effectiveDrillGroupId,
    }));
}
