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

// All group geometry math (world<->local conversion, flattening, rescaling) rounds
// results to 3 decimal places. This 0.001px precision is the only source of drift:
// a flattened group is otherwise visually identical but may shift positions by up to
// ~0.001px per coordinate. Any requirement of bit-exact round-trips must account for
// this boundary.
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function getLayerBounds(layer: Layer): LayerBounds {
  const radians = (layer.rotation * Math.PI) / 180;
  const width =
    Math.abs(layer.width * Math.cos(radians)) +
    Math.abs(layer.height * Math.sin(radians));
  const height =
    Math.abs(layer.width * Math.sin(radians)) +
    Math.abs(layer.height * Math.cos(radians));
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
    animations: [],
  }));
  const group: GroupLayer = {
    id: groupId,
    name: groupName,
    type: "group",
    x: round(bounds.left),
    y: round(bounds.top),
    width: round(bounds.width),
    height: round(bounds.height),
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

export function scaleGroupChildren(
  group: GroupLayer,
  scaleX: number,
  scaleY: number,
): GroupLayer {
  const newWidth = Math.max(1, round(group.width * scaleX));
  const newHeight = Math.max(1, round(group.height * scaleY));
  const children = group.children.map((child): AtomicLayer => {
    const newChildWidth = Math.max(1, round(child.width * scaleX));
    const newChildHeight = Math.max(1, round(child.height * scaleY));
    return {
      ...child,
      x: round(child.x * scaleX),
      y: round(child.y * scaleY),
      width: newChildWidth,
      height: newChildHeight,
    } as AtomicLayer;
  });
  return { ...group, width: newWidth, height: newHeight, children };
}

export function transformGroupChildToScene(
  group: GroupLayer,
  child: AtomicLayer,
): AtomicLayer {
  const radians = (group.rotation * Math.PI) / 180;
  const localCenterX = child.x + child.width / 2 - group.width / 2;
  const localCenterY = child.y + child.height / 2 - group.height / 2;
  const worldCenterX =
    group.x +
    group.width / 2 +
    localCenterX * Math.cos(radians) -
    localCenterY * Math.sin(radians);
  const worldCenterY =
    group.y +
    group.height / 2 +
    localCenterX * Math.sin(radians) +
    localCenterY * Math.cos(radians);

  return {
    ...child,
    x: round(worldCenterX - child.width / 2),
    y: round(worldCenterY - child.height / 2),
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

// Flattening (ungroup / group-collapse during delete) is "lossless" under these
// conditions, because nothing beyond the 3-decimal rounding of `round` can change:
//   - The group carries no animations (group.animations.length === 0), unless the
//     caller explicitly confirms that those animations should be discarded. Group
//     animation cannot be represented exactly on independent children.
//   - The group's opacity is effectively 1 (either opacityEnabled === false, or
//     opacity === 1). Otherwise the multiplied opacity is baked into children, which
//     changes the group's own future opacity edits and is not lossless.
//   - The group's blendMode is "normal" (schema currently locks it to "normal", so
//     this check is always true today; it exists as a forward guard).
// Rotation, visibility, and lock state are propagated losslessly to children
// (children rotation adds the group rotation; visible is AND-ed; locked is OR-ed).
// Non-flattenable groups are refused by `canFlattenGroup`, so callers never silently
// expand a group that would change the visual result.
export function canFlattenGroup(
  group: GroupLayer,
  discardAnimations = false,
): boolean {
  return (
    (discardAnimations || group.animations.length === 0) &&
    (!group.opacityEnabled || group.opacity === 1) &&
    group.blendMode === "normal"
  );
}

export function ungroupLayer(
  scene: Scene,
  groupId: string,
  discardAnimations = false,
): Scene | null {
  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const groupIndex = ordered.findIndex(
    (layer) => layer.id === groupId && layer.type === "group",
  );
  const group = ordered[groupIndex];
  if (!group || group.type !== "group") return null;
  if (!canFlattenGroup(group, discardAnimations)) return null;

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

export type ZOrderAction = "front" | "forward" | "backward" | "back";

function reorderArray<T extends Layer>(
  items: readonly T[],
  isSelected: (item: T) => boolean,
  action: ZOrderAction,
): T[] {
  const selected = items.filter(isSelected);
  if (selected.length === 0) return [...items];
  const rest = items.filter((item) => !isSelected(item));

  if (action === "front") return [...rest, ...selected];
  if (action === "back") return [...selected, ...rest];

  const result = [...items];
  if (action === "forward") {
    for (let i = result.length - 2; i >= 0; i--) {
      if (isSelected(result[i]) && !isSelected(result[i + 1])) {
        const temp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = temp;
      }
    }
  } else {
    for (let i = 1; i < result.length; i++) {
      if (isSelected(result[i]) && !isSelected(result[i - 1])) {
        const temp = result[i];
        result[i] = result[i - 1];
        result[i - 1] = temp;
      }
    }
  }

  return result;
}

export function reorderSelectedLayersZIndex(
  scene: Scene,
  selectedLayerIds: readonly string[],
  action: ZOrderAction,
): Scene {
  const selectedIds = new Set(selectedLayerIds);
  if (selectedIds.size === 0) return scene;

  const topLevelSelected = scene.layers.filter((layer) =>
    selectedIds.has(layer.id),
  );
  const childPairs = scene.layers
    .filter((layer): layer is GroupLayer => layer.type === "group")
    .map((group) => ({
      group,
      children: group.children.filter((child) => selectedIds.has(child.id)),
    }))
    .filter((pair) => pair.children.length > 0);

  const childCount = childPairs.reduce(
    (total, pair) => total + pair.children.length,
    0,
  );
  if (topLevelSelected.length + childCount !== selectedIds.size) return scene;
  if (topLevelSelected.length > 0 && childCount > 0) return scene;

  if (childCount > 0) {
    if (childPairs.length !== 1) return scene;
    const { group, children } = childPairs[0];
    if (children.length !== group.children.filter((child) => selectedIds.has(child.id)).length) {
      return scene;
    }
    const reorderedChildren = reorderArray(
      group.children,
      (child) => selectedIds.has(child.id),
      action,
    ).map((child, zIndex) => ({ ...child, zIndex })) as AtomicLayer[];

    return {
      ...scene,
      layers: scene.layers.map((layer) =>
        layer.id === group.id ? { ...layer, children: reorderedChildren } : layer,
      ),
    };
  }

  const reordered = reorderArray(
    scene.layers,
    (layer) => selectedIds.has(layer.id),
    action,
  );

  return {
    ...scene,
    layers: reordered.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}

function cloneLayer<T extends Layer>(
  layer: T,
  newIdFor: (original: Layer) => string,
): T {
  if (layer.type === "group") {
    const children = layer.children.map((child) => cloneLayer(child, newIdFor));
    return { ...layer, id: newIdFor(layer), children } as T;
  }
  return { ...layer, id: newIdFor(layer) } as T;
}

export function duplicateSelectedLayers(
  scene: Scene,
  selectedLayerIds: readonly string[],
  newIdFor: (original: Layer) => string,
): Scene {
  const selectedIds = new Set(selectedLayerIds);
  if (selectedIds.size === 0) return scene;

  const topLevelSelected = scene.layers.filter((layer) =>
    selectedIds.has(layer.id),
  );
  const childPairs = scene.layers
    .filter((layer): layer is GroupLayer => layer.type === "group")
    .map((group) => ({
      group,
      children: group.children.filter((child) => selectedIds.has(child.id)),
    }))
    .filter((pair) => pair.children.length > 0);

  const childCount = childPairs.reduce(
    (total, pair) => total + pair.children.length,
    0,
  );
  if (topLevelSelected.length + childCount !== selectedIds.size) return scene;
  if (topLevelSelected.length > 0 && childCount > 0) return scene;

  if (childCount > 0) {
    let layers = scene.layers;

    for (const { group } of childPairs) {
      const ordered = [...group.children].sort((a, b) => a.zIndex - b.zIndex);
      const result: AtomicLayer[] = [];

      for (const child of ordered) {
        result.push(child);
        if (selectedIds.has(child.id)) {
          result.push(cloneLayer(child, newIdFor));
        }
      }

      layers = layers.map((layer) =>
        layer.id === group.id
          ? {
              ...layer,
              children: result.map((child, zIndex) => ({
                ...child,
                zIndex,
              })) as AtomicLayer[],
            }
          : layer,
      );
    }

    return { ...scene, layers };
  }

  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const result: Layer[] = [];

  for (const layer of ordered) {
    result.push(layer);
    if (selectedIds.has(layer.id)) {
      result.push(cloneLayer(layer, newIdFor));
    }
  }

  return {
    ...scene,
    layers: result.map((layer, zIndex) => ({ ...layer, zIndex })),
  };
}

export function cloneLayersToTop(
  scene: Scene,
  templateLayers: readonly Layer[],
  newIdFor: (original: Layer) => string,
  offsetX = 0,
  offsetY = 0,
): Scene {
  if (templateLayers.length === 0) return scene;

  const ordered = [...templateLayers].sort((a, b) => a.zIndex - b.zIndex);
  const clones = ordered.map((layer) => {
    const clone = cloneLayer(layer, newIdFor);
    return { ...clone, x: clone.x + offsetX, y: clone.y + offsetY };
  });

  return {
    ...scene,
    layers: [...scene.layers, ...clones].map((layer, zIndex) => ({
      ...layer,
      zIndex,
    })),
  };
}
