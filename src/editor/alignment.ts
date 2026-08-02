import type { Layer, Scene } from "../domain/sceneSchema";
import { getCombinedBounds, getLayerBounds } from "../domain/groupOperations";

export type AlignmentAction =
  | "left"
  | "horizontal-center"
  | "right"
  | "top"
  | "vertical-center"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical"
  | "abut-horizontal-left"
  | "abut-horizontal-right"
  | "abut-vertical-top"
  | "abut-vertical-bottom";

export const ALIGNMENT_BUTTONS = [
  { action: "left", label: "Align left", icon: "⊢" },
  {
    action: "horizontal-center",
    label: "Align horizontal center",
    icon: "↔",
  },
  { action: "right", label: "Align right", icon: "⊣" },
  { action: "top", label: "Align top", icon: "⊤" },
  {
    action: "vertical-center",
    label: "Align vertical center",
    icon: "↕",
  },
  { action: "bottom", label: "Align bottom", icon: "⊥" },
] as const satisfies readonly {
  action: AlignmentAction;
  label: string;
  icon: string;
}[];

export const DISTRIBUTION_BUTTONS = [
  {
    action: "distribute-horizontal",
    label: "Distribute horizontally",
  },
  {
    action: "distribute-vertical",
    label: "Distribute vertically",
  },
] as const satisfies readonly {
  action: AlignmentAction;
  label: string;
}[];

/**
 * Abutment actions: snap one or more selected objects to touch another
 * selected object along the chosen direction with zero gap between them.
 *
 * Each action fixes the two outermost objects on the opposite side and
 * moves only the *next-to-outermost* object into contact. So with two
 * objects A (left) and B (right), `abut-horizontal-left` moves B so that
 * its left edge meets A's right edge; with three A/B/C, it moves only B.
 *
 * - abut-horizontal-left   — second-from-left object's left edge meets
 *                             the leftmost object's right edge.
 * - abut-horizontal-right  — second-from-right object's right edge meets
 *                             the rightmost object's left edge.
 * - abut-vertical-top      — second-from-top object's top edge meets
 *                             the topmost object's bottom edge.
 * - abut-vertical-bottom   — second-from-bottom object's bottom edge
 *                             meets the bottommost object's top edge.
 */
export const ABUTMENT_BUTTONS = [
  {
    action: "abut-horizontal-left",
    label: "Abut: snap left edge to right neighbor",
    icon: "⇤",
  },
  {
    action: "abut-horizontal-right",
    label: "Abut: snap right edge to left neighbor",
    icon: "⇥",
  },
  {
    action: "abut-vertical-top",
    label: "Abut: snap top edge to bottom neighbor",
    icon: "⤒",
  },
  {
    action: "abut-vertical-bottom",
    label: "Abut: snap bottom edge to top neighbor",
    icon: "⤓",
  },
] as const satisfies readonly {
  action: AlignmentAction;
  label: string;
  icon: string;
}[];

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Apply an alignment / abutment / distribution action to a scene.
 *
 * Coordinate-space safety: when the selected layers live in more than one
 * coordinate frame (a mix of scene-rooted objects and group children), the
 * function is a no-op — the caller gets the unchanged scene back.
 */
export function alignSceneLayers(
  scene: Scene,
  selectedLayerIds: readonly string[],
  action: AlignmentAction,
  projectWidth: number,
  projectHeight: number,
): Scene {
  const selectedLayerIdSet = new Set(selectedLayerIds);

  if (selectedLayerIdSet.size === 0) {
    return scene;
  }

  interface AlignSpace {
    spaceId: string;
    width: number;
    height: number;
    layers: Layer[];
  }

  const spaces = new Map<string, AlignSpace>();
  const getSpace = (spaceId: string, width: number, height: number): AlignSpace => {
    let space = spaces.get(spaceId);
    if (!space) {
      space = { spaceId, width, height, layers: [] };
      spaces.set(spaceId, space);
    }
    return space;
  };

  for (const layer of scene.layers) {
    if (layer.type === "group") {
      const childLayers = layer.children.filter((child) =>
        selectedLayerIdSet.has(child.id),
      );
      if (childLayers.length > 0) {
        getSpace(layer.id, layer.width, layer.height).layers.push(...childLayers);
      }
    } else if (selectedLayerIdSet.has(layer.id)) {
      getSpace("scene", projectWidth, projectHeight).layers.push(layer);
    }
  }

  // Mixed coordinate spaces must not produce wrong coordinates: safe no-op.
  if (spaces.size !== 1) {
    return scene;
  }

  const space = [...spaces.values()][0];
  const selectedLayers = space.layers;

  if (selectedLayers.length === 0) {
    return scene;
  }

  const boundsById = new Map(
    selectedLayers.map((layer) => [layer.id, getLayerBounds(layer)]),
  );
  const nextCenters = new Map<string, { x?: number; y?: number }>();

  if (
    action === "abut-horizontal-left" ||
    action === "abut-horizontal-right" ||
    action === "abut-vertical-top" ||
    action === "abut-vertical-bottom"
  ) {
    if (selectedLayers.length < 2) {
      return scene;
    }
    const isHorizontal =
      action === "abut-horizontal-left" || action === "abut-horizontal-right";
    const sortAxis: "left" | "top" = isHorizontal ? "left" : "top";
    const sortedLayers = [...selectedLayers].sort((a, b) => {
      const ba = boundsById.get(a.id);
      const bb = boundsById.get(b.id);
      if (!ba || !bb) return 0;
      return ba[sortAxis] - bb[sortAxis];
    });
    const anchorBounds = boundsById.get(sortedLayers[0].id);
    const movingLayer =
      action === "abut-horizontal-left" || action === "abut-vertical-top"
        ? sortedLayers[1]
        : sortedLayers[sortedLayers.length - 2];
    const movingBounds = boundsById.get(movingLayer.id);
    if (!anchorBounds || !movingBounds) {
      return scene;
    }

    if (action === "abut-horizontal-left") {
      nextCenters.set(movingLayer.id, {
        x: anchorBounds.right + movingBounds.width / 2,
      });
    } else if (action === "abut-horizontal-right") {
      const rightmostBounds = boundsById.get(sortedLayers[sortedLayers.length - 1].id);
      if (!rightmostBounds) return scene;
      nextCenters.set(movingLayer.id, {
        x: rightmostBounds.left - movingBounds.width / 2,
      });
    } else if (action === "abut-vertical-top") {
      nextCenters.set(movingLayer.id, {
        y: anchorBounds.bottom + movingBounds.height / 2,
      });
    } else {
      const bottommostBounds = boundsById.get(sortedLayers[sortedLayers.length - 1].id);
      if (!bottommostBounds) return scene;
      nextCenters.set(movingLayer.id, {
        y: bottommostBounds.top - movingBounds.height / 2,
      });
    }
  } else if (
    action === "distribute-horizontal" ||
    action === "distribute-vertical"
  ) {
    if (selectedLayers.length < 3) {
      return scene;
    }

    const isHorizontal = action === "distribute-horizontal";
    const sortedLayers = [...selectedLayers].sort((first, second) => {
      const firstBounds = boundsById.get(first.id);
      const secondBounds = boundsById.get(second.id);

      if (!firstBounds || !secondBounds) {
        return 0;
      }

      return isHorizontal
        ? firstBounds.left - secondBounds.left
        : firstBounds.top - secondBounds.top;
    });
    const firstBounds = boundsById.get(sortedLayers[0]?.id ?? "");
    const lastBounds = boundsById.get(sortedLayers.at(-1)?.id ?? "");

    if (!firstBounds || !lastBounds) {
      return scene;
    }

    const totalSize = sortedLayers.reduce((total, layer) => {
      const bounds = boundsById.get(layer.id);
      return total + (bounds ? (isHorizontal ? bounds.width : bounds.height) : 0);
    }, 0);
    const span = isHorizontal
      ? lastBounds.right - firstBounds.left
      : lastBounds.bottom - firstBounds.top;
    const gap = (span - totalSize) / (selectedLayers.length - 1);
    let cursor = isHorizontal ? firstBounds.left : firstBounds.top;

    for (const layer of sortedLayers) {
      const bounds = boundsById.get(layer.id);

      if (!bounds) {
        continue;
      }

      const size = isHorizontal ? bounds.width : bounds.height;
      nextCenters.set(
        layer.id,
        isHorizontal
          ? { x: cursor + size / 2 }
          : { y: cursor + size / 2 },
      );
      cursor += size + gap;
    }
  } else {
    const selectedBounds = [...boundsById.values()];
    const targetBounds =
      selectedLayers.length === 1
        ? {
            left: 0,
            top: 0,
            right: space.width,
            bottom: space.height,
            width: space.width,
            height: space.height,
            centerX: space.width / 2,
            centerY: space.height / 2,
          }
        : getCombinedBounds(selectedBounds);

    for (const layer of selectedLayers) {
      const bounds = boundsById.get(layer.id);

      if (!bounds) {
        continue;
      }

      if (action === "left") {
        nextCenters.set(layer.id, { x: targetBounds.left + bounds.width / 2 });
      } else if (action === "horizontal-center") {
        nextCenters.set(layer.id, { x: targetBounds.centerX });
      } else if (action === "right") {
        nextCenters.set(layer.id, { x: targetBounds.right - bounds.width / 2 });
      } else if (action === "top") {
        nextCenters.set(layer.id, { y: targetBounds.top + bounds.height / 2 });
      } else if (action === "vertical-center") {
        nextCenters.set(layer.id, { y: targetBounds.centerY });
      } else if (action === "bottom") {
        nextCenters.set(layer.id, { y: targetBounds.bottom - bounds.height / 2 });
      }
    }
  }

  let changed = false;
  const layers = scene.layers.map((layer) => {
    if (layer.type === "group") {
      if (!layer.children.some((child) => nextCenters.has(child.id))) {
        return layer;
      }
      const children = layer.children.map((child) => {
        const nextCenter = nextCenters.get(child.id);

        if (!nextCenter) {
          return child;
        }

        const nextX = roundCoordinate(
          (nextCenter.x ?? child.x + child.width / 2) - child.width / 2,
        );
        const nextY = roundCoordinate(
          (nextCenter.y ?? child.y + child.height / 2) - child.height / 2,
        );

        if (nextX === child.x && nextY === child.y) {
          return child;
        }

        changed = true;
        return {
          ...child,
          x: nextX,
          y: nextY,
        };
      });
      return { ...layer, children };
    }

    const nextCenter = nextCenters.get(layer.id);

    if (!nextCenter) {
      return layer;
    }

    const nextX = roundCoordinate(
      (nextCenter.x ?? layer.x + layer.width / 2) - layer.width / 2,
    );
    const nextY = roundCoordinate(
      (nextCenter.y ?? layer.y + layer.height / 2) - layer.height / 2,
    );

    if (nextX === layer.x && nextY === layer.y) {
      return layer;
    }

    changed = true;
    return {
      ...layer,
      x: nextX,
      y: nextY,
    };
  });

  return changed ? { ...scene, layers } : scene;
}