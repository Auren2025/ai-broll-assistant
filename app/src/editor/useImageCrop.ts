import { useCallback, useState } from "react";
import type { Scene } from "../domain/sceneSchema";
import { findLayerById } from "../domain/groupOperations";
import type { InspectorScope } from "./useEditorSelection";
import { findParentGroupLayer } from "./fabricLayerLookup";
import type { useLayerEdits } from "./useLayerEdits";

export interface ImageCropPatch {
  focalX: number;
  focalY: number;
  zoom: number;
}

interface UseImageCropOptions {
  scene: Scene | null;
  activeInsertionGroupId: string | null;
  selectedLayerIds: readonly string[];
  layerEdits: Pick<ReturnType<typeof useLayerEdits>, "patchLayerById">;
  setSelectedLayerIds: (layerIds: string[]) => void;
  setSelectedAnimationId: (animationId: string | null) => void;
  setInspectorScope: (scope: InspectorScope) => void;
}

export interface ImageCropApi {
  croppingLayerId: string | null;
  enterImageCrop: (layerId: string) => void;
  exitImageCrop: () => void;
  commitImageCrop: (layerId: string, patch: ImageCropPatch) => void;
}

/**
 * Owns the App-level image crop mode state: which layer is being cropped
 * and the enter/exit/commit transitions. The canvas-side gesture handling
 * (pan/zoom sessions, crop visuals) lives in useImageCropGestures; this
 * hook owns the React state and the history-recording patch calls.
 *
 * Crop mode is canvas-only interaction state: the frame is locked while
 * the image inside it can be panned/zoomed. Entered by double-clicking an
 * image or the inspector button; exited by Escape, double-click, the Done
 * button, scene switch, or selecting away.
 */
export function useImageCrop(options: UseImageCropOptions): ImageCropApi {
  const {
    scene,
    activeInsertionGroupId,
    selectedLayerIds,
    layerEdits,
    setSelectedLayerIds,
    setSelectedAnimationId,
    setInspectorScope,
  } = options;
  const [croppingLayerId, setCroppingLayerId] = useState<string | null>(null);

  const exitImageCrop = useCallback(() => {
    setCroppingLayerId(null);
  }, []);

  // Crop mode cannot survive drill-in or scene changes (both replace the
  // canvas presentation), and leaving the cropping layer ends it. These
  // are adjusted during render rather than in effects so the canvas never
  // commits a frame with a stale crop session.
  const [prevDrillGroupId, setPrevDrillGroupId] = useState(
    activeInsertionGroupId,
  );
  if (prevDrillGroupId !== activeInsertionGroupId) {
    setPrevDrillGroupId(activeInsertionGroupId);
    setCroppingLayerId(null);
  }
  const [prevSceneId, setPrevSceneId] = useState(scene?.id);
  if (prevSceneId !== scene?.id) {
    setPrevSceneId(scene?.id);
    setCroppingLayerId(null);
  }
  if (croppingLayerId !== null && !selectedLayerIds.includes(croppingLayerId)) {
    setCroppingLayerId(null);
  }

  const enterImageCrop = useCallback(
    (layerId: string) => {
      const target = scene ? findLayerById(scene.layers, layerId) : null;
      const parentGroup = scene ? findParentGroupLayer(scene, layerId) : null;
      if (
        !target || target.type !== "image" || target.src === null ||
        target.locked ||
        (parentGroup !== null && parentGroup.id !== activeInsertionGroupId)
      ) {
        // Crop mode only supports top-level images (or images in the drilled
        // group): a grouped image would drag its whole group on the canvas.
        return;
      }
      setSelectedLayerIds([layerId]);
      setSelectedAnimationId(null);
      setInspectorScope("layer");
      if (target.fit !== "cover") {
        // Crop mode is cover semantics: the frame defines the visible
        // window. Recorded as its own history entry.
        layerEdits.patchLayerById(layerId, { fit: "cover" });
      }
      setCroppingLayerId(layerId);
    },
    [
      activeInsertionGroupId,
      layerEdits,
      scene,
      setInspectorScope,
      setSelectedAnimationId,
      setSelectedLayerIds,
    ],
  );

  const commitImageCrop = useCallback(
    (layerId: string, patch: ImageCropPatch) => {
      // One history entry per gesture; no-op drags are dropped by the patch
      // path because no value changed.
      layerEdits.patchLayerById(layerId, patch);
    },
    [layerEdits],
  );

  return { croppingLayerId, enterImageCrop, exitImageCrop, commitImageCrop };
}
