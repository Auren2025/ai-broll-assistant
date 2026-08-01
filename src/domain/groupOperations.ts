import type { AtomicLayer } from "./atomicLayerSchema";
import type { GroupLayer } from "./groupLayerSchema";
import type { Layer, Scene } from "./sceneSchema";

export interface LayerBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function getLayerBounds(layer: Layer): LayerBounds {
  const radians = (layer.rotation * Math.PI) / 180;
  const scaledWidth = layer.width * layer.scaleX;
  const scaledHeight = layer.height * layer.scaleY;
  const width =
    Math.abs(scaledWidth * Math.cos(radians)) +
    Math.abs(scaledHeight * Math.sin(radians));
  const height =
    Math.abs(scaledWidth * Math.sin(radians)) +
    Math.abs(scaledHeight * Math.cos(radians));
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerX,
    centerY,
  };
}

export function getCombinedBounds(bounds: readonly LayerBounds[]): LayerBounds {
  const left = Math.min(...bounds.map((candidate) => candidate.left));
  const top = Math.min(...bounds.map((candidate) => candidate.top));
  const right = Math.max(...bounds.map((candidate) => candidate.right));
  const bottom = Math.max(...bounds.map((candidate) => candidate.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function getAllLayers(layers: readonly Layer[]): Layer[] {
  return layers.flatMap((layer) =>
    layer.type === "group" ? [layer, ...layer.children] : [layer],
  );
}

export function findLayerById(
  layers: readonly Layer[],
  layerId: string,
): Layer | null {
  for (const layer of layers) {
    if (layer.id === layerId) return layer;
    if (layer.type === "group") {
      const child = layer.children.find((candidate) => candidate.id === layerId);
      if (child) return child;
    }
  }
  return null;
}

export function updateLayerById(
  layers: readonly Layer[],
  layerId: string,
  update: (layer: Layer) => Layer,
): Layer[] {
  return layers.map((layer) => {
    if (layer.id === layerId) return update(layer);
    if (layer.type !== "group") return layer;
    const childIndex = layer.children.findIndex((child) => child.id === layerId);
    if (childIndex < 0) return layer;
    const children = [...layer.children];
    children[childIndex] = update(children[childIndex]) as AtomicLayer;
    return { ...layer, children };
  });
}

export function makeGroup(
  scene: Scene,
  selectedLayerIds: readonly string[],
  groupId: string,
  groupName: string,
): Scene | null {
  const selectedIds = new Set(selectedLayerIds);
  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const selected = ordered.filter(
    (layer): layer is AtomicLayer =>
      selectedIds.has(layer.id) && layer.type !== "group" && !layer.locked,
  );
  if (selected.length < 2 || selected.length !== selectedIds.size) return null;

  const bounds = getCombinedBounds(selected.map(getLayerBounds));
  const highestSelectedIndex = Math.max(
    ...ordered.map((layer, index) => (selectedIds.has(layer.id) ? index : -1)),
  );
  const insertionIndex = ordered
    .slice(0, highestSelectedIndex + 1)
    .filter((layer) => !selectedIds.has(layer.id)).length;
  const children = selected.map((layer, index) => ({
    ...layer,
    x: round(layer.x - bounds.left),
    y: round(layer.y - bounds.top),
    zIndex: index,
  }));
  const group: GroupLayer = {
    id: groupId,
    name: groupName,
    type: "group",
    x: round(bounds.left),
    y: round(bounds.top),
    width: round(bounds.width),
    height: round(bounds.height),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [],
    children,
  };
  const remaining = ordered.filter((layer) => !selectedIds.has(layer.id));
  remaining.splice(insertionIndex, 0, group);

  return {
    ...scene,
    layers: remaining.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}

export function transformGroupChildToScene(
  group: GroupLayer,
  child: AtomicLayer,
): AtomicLayer {
  const scale = group.scaleX;
  const radians = (group.rotation * Math.PI) / 180;
  const localCenterX = child.x + child.width / 2 - group.width / 2;
  const localCenterY = child.y + child.height / 2 - group.height / 2;
  const scaledX = localCenterX * scale;
  const scaledY = localCenterY * scale;
  const worldCenterX =
    group.x + group.width / 2 +
    scaledX * Math.cos(radians) -
    scaledY * Math.sin(radians);
  const worldCenterY =
    group.y + group.height / 2 +
    scaledX * Math.sin(radians) +
    scaledY * Math.cos(radians);

  return {
    ...child,
    x: round(worldCenterX - child.width / 2),
    y: round(worldCenterY - child.height / 2),
    scaleX: round(child.scaleX * scale),
    scaleY: round(child.scaleY * scale),
    rotation: round(child.rotation + group.rotation),
    opacity: round(
      (child.opacityEnabled ? child.opacity : 1) *
        (group.opacityEnabled ? group.opacity : 1),
    ),
    opacityEnabled: true,
    visible: group.visible && child.visible,
    locked: group.locked || child.locked,
  };
}

export function canFlattenGroup(group: GroupLayer): boolean {
  return (
    group.animations.length === 0 &&
    (!group.opacityEnabled || group.opacity === 1) &&
    group.blendMode === "normal"
  );
}

export function ungroupLayer(scene: Scene, groupId: string): Scene | null {
  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const groupIndex = ordered.findIndex(
    (layer) => layer.id === groupId && layer.type === "group",
  );
  const group = ordered[groupIndex];
  if (!group || group.type !== "group") return null;

  const children = [...group.children]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((child) => transformGroupChildToScene(group, child));
  ordered.splice(groupIndex, 1, ...children);

  return {
    ...scene,
    layers: ordered.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}

export function deleteLayers(
  scene: Scene,
  selectedLayerIds: readonly string[],
): Scene {
  const selectedIds = new Set(selectedLayerIds);
  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const next: Layer[] = [];

  for (const layer of ordered) {
    if (selectedIds.has(layer.id)) continue;
    if (layer.type !== "group") {
      next.push(layer);
      continue;
    }

    const children = layer.children.filter((child) => !selectedIds.has(child.id));
    if (children.length >= 2) {
      next.push({ ...layer, children });
    } else if (children.length === 1) {
      next.push(transformGroupChildToScene(layer, children[0]));
    }
  }

  return {
    ...scene,
    layers: next.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}
