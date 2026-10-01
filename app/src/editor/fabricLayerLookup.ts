import type { GroupLayer } from "../domain/groupLayerSchema";
import { findParentGroup } from "../domain/groupOperations";
import type { Layer, Scene } from "../domain/sceneSchema";

export function findLayerByIdOrChild(scene: Scene, layerId: string): Layer | null {
  for (const layer of scene.layers) {
    if (layer.id === layerId) return layer;
    if (layer.type === "group") {
      const child = layer.children.find(
        (candidate) => candidate.id === layerId,
      );
      if (child) return child;
    }
  }
  return null;
}

export function findParentGroupLayer(
  scene: Scene,
  layerId: string,
): GroupLayer | null {
  return findParentGroup(scene.layers, layerId);
}