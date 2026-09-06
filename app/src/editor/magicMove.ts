import type { FabricObject } from "fabric";
import type { AtomicLayer } from "../domain/atomicLayerSchema";
import type { GroupLayer } from "../domain/groupLayerSchema";
import type { MagicMoveAnimation } from "../domain/layerAnimationSchema";
import type { Layer, Scene } from "../domain/sceneSchema";
import { findLayerByIdOrChild, findParentGroupLayer } from "./fabricLayerLookup";

export interface MagicMoveContext {
  layer: Layer;
  parentGroup: GroupLayer | null;
  animation: MagicMoveAnimation;
}

export function resolveMagicMoveContext(
  scene: Scene,
  selectedLayerIds: readonly string[],
  selectedAnimationId: string | null | undefined,
): MagicMoveContext | null {
  if (selectedLayerIds.length !== 1 || !selectedAnimationId) return null;
  const layer = findLayerByIdOrChild(scene, selectedLayerIds[0]);
  if (!layer || layer.locked || !layer.visible) return null;
  const parentGroup = findParentGroupLayer(scene, layer.id);
  if (parentGroup && (parentGroup.locked || !parentGroup.visible)) return null;
  const animation = layer.animations.find(
    (candidate): candidate is MagicMoveAnimation =>
      candidate.id === selectedAnimationId && candidate.preset === "magic-move",
  );
  return animation ? { layer, parentGroup, animation } : null;
}

export function sortChildrenByZIndex(
  children: readonly AtomicLayer[],
): AtomicLayer[] {
  return [...children].sort(
    (first, second) => first.zIndex - second.zIndex,
  );
}

export function roundNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getChildLayerPositionFromObject(
  groupLayer: GroupLayer,
  childWidth: number,
  childHeight: number,
  childObject: FabricObject,
): { x: number; y: number } {
  const centerX = childObject.left ?? 0;
  const centerY = childObject.top ?? 0;
  return {
    x: roundNumber(centerX + groupLayer.width / 2 - childWidth / 2),
    y: roundNumber(centerY + groupLayer.height / 2 - childHeight / 2),
  };
}

export function fabricChildrenMatch(
  fabricChildren: readonly FabricObject[],
  sceneChildren: readonly AtomicLayer[],
  objectToLayerId: ReadonlyMap<FabricObject, string>,
): boolean {
  return (
    fabricChildren.length === sceneChildren.length &&
    fabricChildren.every(
      (childObject, index) =>
        objectToLayerId.get(childObject) === sceneChildren[index].id,
    )
  );
}

export function readVisibleWidth(obj: FabricObject, minWidth = 1): number {
  return Math.max(
    minWidth,
    roundNumber((obj.width ?? 0) * Math.abs(obj.scaleX ?? 1)),
  );
}

export function readVisibleHeight(obj: FabricObject, minHeight = 1): number {
  return Math.max(
    minHeight,
    roundNumber((obj.height ?? 0) * Math.abs(obj.scaleY ?? 1)),
  );
}