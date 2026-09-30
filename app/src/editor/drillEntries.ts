import type { GroupLayer } from "../domain/groupLayerSchema";
import type { Layer } from "../domain/sceneSchema";
import { sortChildrenByZIndex } from "./magicMove";

/**
 * One row of what the canvas should render as a top-level object.
 *
 * When drilling into a group (`drillGroupId` set), the drilled group's
 * children are promoted to top-level canvas objects (absolute coordinates,
 * directly selectable) and every other entry is dimmed and non-interactive.
 */
export interface DrillEntry {
  layer: Layer;
  /** True when the entry is outside the drilled group and should be dimmed. */
  dimmed: boolean;
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
 * Flatten the scene's top-level layers into canvas entries. A drilled group
 * is replaced by its children (in z-order, at the group's position);
 * everything else renders normally but dimmed while drilling.
 */
export function computeDrillEntries(
  layers: readonly Layer[],
  drillGroupId: string | null,
): DrillEntry[] {
  const drilling = drillGroupId !== null;
  const drillGroup = drilling ? findDrillGroup(layers, drillGroupId) : null;
  // A stale drill id (group deleted) renders as if not drilling.
  const effectiveDrillGroupId = drillGroup ? drillGroupId : null;
  const sortedLayers = [...layers].sort((first, second) => first.zIndex - second.zIndex);
  const entries: DrillEntry[] = [];
  for (const layer of sortedLayers) {
    if (layer.type === "group" && layer.id === effectiveDrillGroupId) {
      for (const child of sortChildrenByZIndex(layer.children)) {
        entries.push({ layer: child, dimmed: false });
      }
      continue;
    }
    entries.push({ layer, dimmed: effectiveDrillGroupId !== null });
  }
  return entries;
}
