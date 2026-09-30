import { useCallback } from "react";
import { findLayerById, scaleGroupChildren, updateLayerById } from "../domain/groupOperations";
import type { LayerAnimation } from "../domain/layerAnimationSchema";
import { isLineDrawEligible } from "../domain/lineDraw";
import type { Layer, Scene } from "../domain/sceneSchema";
import type { EditableLayerPatch } from "./layerEditing";
import { computeTextBoxSize } from "./textMetrics";

function findParentGroup(layers: readonly Layer[], layerId: string) {
  return layers.find((layer) => layer.type === "group" &&
    layer.children.some((child) => child.id === layerId));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function useLayerEdits(
  scene: Scene | null,
  selectedLayerId: string | null,
  handleSceneChange: (scene: Scene) => void,
) {
  const patchSelectedLayer = useCallback((patch: EditableLayerPatch) => {
    if (!scene || !selectedLayerId) return;
    const selected = findLayerById(scene.layers, selectedLayerId);
    const parentGroup = findParentGroup(scene.layers, selectedLayerId);
    if (!selected || selected.locked || parentGroup?.locked) return;
    const patchKeys = Object.keys(patch);
    if (patchKeys.length === 0) return;

    let changed = false;
    const layers = updateLayerById(scene.layers, selectedLayerId, (layer) => {
      const layerRecord = layer as unknown as Record<string, unknown>;
      const patchRecord = patch as Record<string, unknown>;
      if (!patchKeys.some((key) => layerRecord[key] !== patchRecord[key])) return layer;
      changed = true;
      if (layer.type === "group" && ("width" in patch || "height" in patch)) {
        const targetWidth = patch.width ?? layer.width;
        const targetHeight = patch.height ?? layer.height;
        const rescaled = scaleGroupChildren(
          { ...layer, width: layer.width, height: layer.height },
          layer.width > 0 ? targetWidth / layer.width : 1,
          layer.height > 0 ? targetHeight / layer.height : 1,
        );
        return {
          ...rescaled,
          x: roundCoordinate(layer.x + layer.width / 2 - rescaled.width / 2),
          y: roundCoordinate(layer.y + layer.height / 2 - rescaled.height / 2),
        };
      }
      if (layer.type === "text") {
        const merged: Layer = { ...layer, ...patch } as Layer;
        if (merged.type !== "text") return merged;
        const typographyChanged = patchKeys.some((key) => [
          "text", "fontFamily", "fontSize", "fontWeight", "fontStyle",
          "lineHeight", "letterSpacing", "textCase", "autoResize",
        ].includes(key));
        const { width, height } = typographyChanged ? computeTextBoxSize(merged) : merged;
        return {
          ...merged, width, height,
          x: layer.x - (width - layer.width) / 2,
          y: layer.y - (height - layer.height) / 2,
        } as Layer;
      }
      const merged = { ...layer, ...patch } as Layer;
      return !isLineDrawEligible(merged) &&
        merged.animations.some((animation) => animation.preset === "line-draw")
        ? { ...merged, animations: merged.animations.filter((animation) => animation.preset !== "line-draw") }
        : merged;
    });
    if (changed) handleSceneChange({ ...scene, layers });
  }, [handleSceneChange, scene, selectedLayerId]);

  const changeLayerAnimations = useCallback((layerId: string, animations: LayerAnimation[]) => {
    if (!scene) return;
    const selected = findLayerById(scene.layers, layerId);
    if (!selected || selected.locked || findParentGroup(scene.layers, layerId)) return;
    let changed = false;
    const layers = updateLayerById(scene.layers, layerId, (layer) => {
      if (JSON.stringify(layer.animations) === JSON.stringify(animations)) return layer;
      changed = true;
      return { ...layer, animations };
    });
    if (changed) handleSceneChange({ ...scene, layers });
  }, [handleSceneChange, scene]);

  const changeSelectedLayerAnimations = useCallback((animations: LayerAnimation[]) => {
    if (selectedLayerId) changeLayerAnimations(selectedLayerId, animations);
  }, [changeLayerAnimations, selectedLayerId]);

  const changeTextLayer = useCallback((layerId: string, text: string, width: number, height: number) => {
    if (!scene) return;
    const target = findLayerById(scene.layers, layerId);
    const parentGroup = findParentGroup(scene.layers, layerId);
    if (!target || (target.type !== "text" && target.type !== "rectangle" && target.type !== "circle") ||
        target.locked || parentGroup?.locked) return;
    if (target.type !== "text") {
      if (target.type === "circle" && (target.donut !== 0 || target.sweep !== 360)) return;
      if (target.shapeText.text === text) return;
      const layers = updateLayerById(scene.layers, layerId, (layer) =>
        layer.type === "rectangle" || layer.type === "circle"
          ? { ...layer, shapeText: { ...layer.shapeText, text } } : layer);
      handleSceneChange({ ...scene, layers });
      return;
    }
    const nextWidth = Math.max(1, Math.ceil(width));
    const nextHeight = Math.max(1, Math.ceil(height));
    if (target.text === text && Math.abs(target.width - nextWidth) < 0.5 &&
        Math.abs(target.height - nextHeight) < 0.5) return;
    const layers = updateLayerById(scene.layers, layerId, (layer) => {
      if (layer.type !== "text") return layer;
      return {
        ...layer, text, width: nextWidth, height: nextHeight,
        x: layer.x - (nextWidth - layer.width) / 2,
        y: layer.y - (nextHeight - layer.height) / 2,
      };
    });
    handleSceneChange({ ...scene, layers });
  }, [handleSceneChange, scene]);

  const changeAnimationTiming = useCallback((
    layerId: string, animationId: string,
    patch: Pick<LayerAnimation, "startFrame" | "durationInFrames">,
  ) => {
    const layer = scene ? findLayerById(scene.layers, layerId) : null;
    if (!layer) return;
    changeLayerAnimations(layerId, layer.animations.map((animation) =>
      animation.id === animationId ? { ...animation, ...patch } : animation));
  }, [changeLayerAnimations, scene]);

  const commitMagicMoveTranslation = useCallback((
    layerId: string, animationId: string, translateX: number, translateY: number,
  ) => {
    const layer = scene ? findLayerById(scene.layers, layerId) : null;
    if (!layer) return;
    changeLayerAnimations(layerId, layer.animations.map((animation) =>
      animation.id === animationId && animation.preset === "magic-move"
        ? { ...animation, translateX, translateY } : animation));
  }, [changeLayerAnimations, scene]);

  return {
    patchSelectedLayer, changeSelectedLayerAnimations, changeTextLayer,
    changeAnimationTiming, commitMagicMoveTranslation,
  };
}
