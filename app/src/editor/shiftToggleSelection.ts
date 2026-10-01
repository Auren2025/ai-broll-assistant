import type { Scene } from "../domain/sceneSchema";
import { findLayerByIdOrChild, findParentGroupLayer } from "./fabricLayerLookup";

/**
 * Shift+click toggle semantics for a (possibly promoted) canvas target.
 *
 * Mirrors the layer tree's additive selection (`onTreeLayerSelect`):
 * - clicking an already-selected id removes it (toggle off);
 * - adding a group drops its children's ids;
 * - adding a child drops its parent group's id.
 *
 * Group and child are mutually exclusive in one selection, so a promoted
 * group child never lands in the same selection as its own group.
 */
export function toggleShiftSelection(
  currentIds: readonly string[],
  toggledId: string,
  scene: Scene,
): string[] {
  if (currentIds.includes(toggledId)) {
    return currentIds.filter((candidate) => candidate !== toggledId);
  }
  const layer = findLayerByIdOrChild(scene, toggledId);
  if (!layer || layer.type !== "group") {
    const parentGroup = findParentGroupLayer(scene, toggledId);
    return [
      ...currentIds.filter((candidate) => candidate !== parentGroup?.id),
      toggledId,
    ];
  }
  return [
    ...currentIds.filter(
      (candidate) => !layer.children.some((child) => child.id === candidate),
    ),
    toggledId,
  ];
}
