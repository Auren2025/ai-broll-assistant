import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import type { Canvas, FabricObject } from "fabric";
import type { Scene } from "../domain/sceneSchema";
import { setImageCropMode } from "./fabricAdapter";
import {
  findLayerByIdOrChild,
  findParentGroupLayer,
} from "./fabricLayerLookup";
import { FabricImageLayerObject } from "./fabricObjects";
import { clampFocal, clampImageCropZoom } from "./imageCrop";
import type { ImageCropPatch } from "./useImageCrop";

/** The subset of a fabric pointer event the crop gestures read. */
export interface CropPointerEvent {
  target?: FabricObject | null;
  subTargets?: FabricObject[];
  scenePoint?: { x: number; y: number };
}

type CropSession =
  | {
      type: "pan";
      layerId: string;
      lastLocal: { x: number; y: number };
    }
  | {
      type: "zoom";
      layerId: string;
      startZoom: number;
      startDist: number;
    };

interface UseImageCropGesturesOptions {
  croppingLayerId: string | null;
  fabricCanvasRef: RefObject<Canvas | null>;
  layerIdToObjectRef: RefObject<Map<string, FabricObject>>;
  objectToLayerIdRef: RefObject<Map<FabricObject, string>>;
  sceneRef: RefObject<Scene>;
  drillGroupIdRef: RefObject<string | null>;
  onImageCropEnter?: (layerId: string) => void;
  onImageCropExit?: () => void;
  onImageCropCommit?: (layerId: string, patch: ImageCropPatch) => void;
}

export interface ImageCropGesturesApi {
  /**
   * mouse:move crop branch. Returns true when the event was consumed by
   * crop mode (active pan/zoom gesture, or cursor hint over the cropping
   * image); the caller should then skip the normal hover logic.
   */
  handleCropMouseMove: (canvas: Canvas, event: CropPointerEvent) => boolean;
  /**
   * mouse:down crop branch. Returns true when a pan/zoom session started
   * and takes over the press.
   */
  handleCropMouseDown: (event: CropPointerEvent) => boolean;
  /** mouse:up: end the in-flight gesture and commit focal/zoom. */
  handleCropMouseUp: () => void;
  /**
   * mouse:dblclick crop branch. Returns true when double-click toggled
   * crop mode for an image; the caller should then skip drill-in handling.
   */
  handleCropDblClick: (event: CropPointerEvent) => boolean;
  /**
   * Re-apply the canvas-only crop visuals after a scene sync, which does
   * not know about crop mode.
   */
  reapplyCropVisuals: (
    layerIdToObject: ReadonlyMap<string, FabricObject>,
  ) => void;
}

/**
 * Owns the canvas-side image crop interaction: the in-flight pan/zoom
 * gesture session, the crop-mode visual toggle, and the double-click
 * enter/exit. The React-level crop state (which layer is cropping) lives
 * in App via useImageCrop; this hook owns everything that touches the
 * fabric canvas. All returned callbacks are referentially stable.
 */
export function useImageCropGestures(
  options: UseImageCropGesturesOptions,
): ImageCropGesturesApi {
  const {
    croppingLayerId,
    fabricCanvasRef,
    layerIdToObjectRef,
    objectToLayerIdRef,
    sceneRef,
    drillGroupIdRef,
    onImageCropEnter,
    onImageCropExit,
    onImageCropCommit,
  } = options;

  // The in-flight pan/zoom gesture, and the latest prop callbacks (mirrored
  // to refs so the long-lived canvas handlers never close over stale values).
  const croppingLayerIdRef = useRef<string | null>(croppingLayerId);
  const onImageCropEnterRef = useRef(onImageCropEnter);
  const onImageCropExitRef = useRef(onImageCropExit);
  const onImageCropCommitRef = useRef(onImageCropCommit);
  const cropSessionRef = useRef<CropSession | null>(null);
  const prevCroppingLayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    croppingLayerIdRef.current = croppingLayerId;
  }, [croppingLayerId]);

  useEffect(() => {
    onImageCropEnterRef.current = onImageCropEnter;
    onImageCropExitRef.current = onImageCropExit;
    onImageCropCommitRef.current = onImageCropCommit;
  }, [onImageCropEnter, onImageCropExit, onImageCropCommit]);

  // Apply/clear the canvas-only crop visuals whenever the cropping layer
  // changes. Scene sync (applyLayerToFabricObject) does not know about crop
  // mode, so this effect owns the toggle on both enter and exit.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    const previous = prevCroppingLayerIdRef.current;
    if (previous && previous !== croppingLayerId) {
      const previousObject = layerIdToObjectRef.current.get(previous);
      if (previousObject) {
        setImageCropMode(previousObject, false);
      }
      // A crop gesture cannot outlive crop mode.
      cropSessionRef.current = null;
    }
    if (croppingLayerId) {
      const object = layerIdToObjectRef.current.get(croppingLayerId);
      if (object) {
        setImageCropMode(object, true);
        canvas?.setActiveObject(object);
      }
    }
    prevCroppingLayerIdRef.current = croppingLayerId;
    canvas?.requestRenderAll();
  }, [croppingLayerId, fabricCanvasRef, layerIdToObjectRef]);

  const handleCropMouseMove = useCallback(
    (canvas: Canvas, event: CropPointerEvent): boolean => {
      const cropSession = cropSessionRef.current;
      const croppingId = croppingLayerIdRef.current;
      if ((cropSession || croppingId) && event.scenePoint) {
        const targetId = cropSession ? cropSession.layerId : croppingId;
        const targetObject =
          targetId != null
            ? layerIdToObjectRef.current.get(targetId)
            : undefined;
        if (targetObject instanceof FabricImageLayerObject) {
          const local = targetObject.toCropLocalPoint(event.scenePoint);
          if (cropSession?.type === "pan") {
            // Drag the image inside the locked frame: convert the pointer
            // delta to focal deltas. span is zero on an exactly-filled
            // axis, which correctly disables panning there.
            const placement = targetObject.getCropImagePlacement();
            if (placement) {
              const spanX = targetObject.width - placement.width;
              const spanY = targetObject.height - placement.height;
              const dfx =
                Math.abs(spanX) > 1e-6
                  ? (local.x - cropSession.lastLocal.x) / spanX
                  : 0;
              const dfy =
                Math.abs(spanY) > 1e-6
                  ? (local.y - cropSession.lastLocal.y) / spanY
                  : 0;
              targetObject.imageFocalX = clampFocal(
                targetObject.imageFocalX + dfx,
              );
              targetObject.imageFocalY = clampFocal(
                targetObject.imageFocalY + dfy,
              );
              targetObject.dirty = true;
              canvas.requestRenderAll();
            }
            cropSession.lastLocal = { x: local.x, y: local.y };
            canvas.setCursor("grabbing");
            return true;
          }
          if (cropSession?.type === "zoom") {
            // Drag away from the frame center to zoom in, toward it to
            // zoom out. The focal point stays pinned while zooming.
            const dist = Math.hypot(local.x, local.y);
            targetObject.imageZoom = clampImageCropZoom(
              (cropSession.startZoom * dist) / cropSession.startDist,
            );
            targetObject.dirty = true;
            canvas.requestRenderAll();
            canvas.setCursor("nwse-resize");
            return true;
          }
          // No active gesture: hint the zoom handle and the draggable
          // image; otherwise fall through to the normal hover logic.
          const handle = targetObject.cropZoomHandle;
          if (
            handle != null &&
            Math.hypot(local.x - handle.x, local.y - handle.y) <=
              handle.radius
          ) {
            canvas.setCursor("nwse-resize");
            return true;
          }
          const ghost = targetObject.getCropImagePlacement();
          if (
            ghost != null &&
            local.x >= ghost.x &&
            local.x <= ghost.x + ghost.width &&
            local.y >= ghost.y &&
            local.y <= ghost.y + ghost.height
          ) {
            canvas.setCursor("move");
            return true;
          }
        }
      }
      return false;
    },
    [layerIdToObjectRef],
  );

  const handleCropMouseDown = useCallback(
    (event: CropPointerEvent): boolean => {
      // Crop gestures take over for the cropping image: drag the zoom
      // handle to zoom, drag the (dimmed) image to pan. The frame itself
      // is locked.
      const croppingId = croppingLayerIdRef.current;
      if (croppingId && event.scenePoint) {
        const croppingObject = layerIdToObjectRef.current.get(croppingId);
        if (croppingObject instanceof FabricImageLayerObject) {
          const local = croppingObject.toCropLocalPoint(event.scenePoint);
          const handle = croppingObject.cropZoomHandle;
          if (
            handle &&
            Math.hypot(local.x - handle.x, local.y - handle.y) <=
              handle.radius
          ) {
            cropSessionRef.current = {
              type: "zoom",
              layerId: croppingId,
              startZoom: croppingObject.imageZoom,
              startDist: Math.max(Math.hypot(local.x, local.y), 1e-6),
            };
            return true;
          }
          const placement = croppingObject.getCropImagePlacement();
          if (
            placement &&
            local.x >= placement.x &&
            local.x <= placement.x + placement.width &&
            local.y >= placement.y &&
            local.y <= placement.y + placement.height
          ) {
            cropSessionRef.current = {
              type: "pan",
              layerId: croppingId,
              lastLocal: { x: local.x, y: local.y },
            };
            return true;
          }
        }
      }
      return false;
    },
    [layerIdToObjectRef],
  );

  const handleCropMouseUp = useCallback((): void => {
    // End of a crop gesture: commit focal/zoom to the layer in one
    // history entry. A no-op drag commits identical values, which the
    // patch path drops without recording history.
    const cropSession = cropSessionRef.current;
    if (cropSession) {
      cropSessionRef.current = null;
      const object = layerIdToObjectRef.current.get(cropSession.layerId);
      if (object instanceof FabricImageLayerObject) {
        onImageCropCommitRef.current?.(cropSession.layerId, {
          focalX: clampFocal(object.imageFocalX),
          focalY: clampFocal(object.imageFocalY),
          zoom: clampImageCropZoom(object.imageZoom),
        });
      }
    }
  }, [layerIdToObjectRef]);

  const handleCropDblClick = useCallback(
    (event: CropPointerEvent): boolean => {
      // Double-click an image toggles its crop mode (frame stays fixed,
      // the image inside can be panned/zoomed). This runs before group
      // edit handling so images win the gesture.
      const cropCandidate = [...(event.subTargets ?? []), event.target]
        .reverse()
        .find(
          (candidate): candidate is FabricImageLayerObject =>
            candidate instanceof FabricImageLayerObject,
        );
      if (cropCandidate) {
        const layerId = objectToLayerIdRef.current.get(cropCandidate);
        const layer =
          layerId != null
            ? findLayerByIdOrChild(sceneRef.current, layerId)
            : null;
        // Images inside the drilled group can be cropped while drilling;
        // other grouped images still need ungrouping first.
        const parentGroup =
          layerId != null
            ? findParentGroupLayer(sceneRef.current, layerId)
            : null;
        if (
          layerId != null &&
          layer?.type === "image" &&
          layer.src !== null &&
          !layer.locked &&
          (parentGroup === null || parentGroup.id === drillGroupIdRef.current)
        ) {
          if (croppingLayerIdRef.current === layerId) {
            onImageCropExitRef.current?.();
          } else {
            onImageCropEnterRef.current?.(layerId);
          }
          return true;
        }
      }
      return false;
    },
    [drillGroupIdRef, objectToLayerIdRef, sceneRef],
  );

  const reapplyCropVisuals = useCallback(
    (layerIdToObject: ReadonlyMap<string, FabricObject>): void => {
      // Scene sync does not know about crop mode; re-apply the canvas-only
      // crop visuals so a sync (e.g. the crop commit itself) never drops
      // them mid-session.
      const croppingId = croppingLayerIdRef.current;
      if (croppingId) {
        const croppingObject = layerIdToObject.get(croppingId);
        if (croppingObject) {
          setImageCropMode(croppingObject, true);
        }
      }
    },
    [],
  );

  return {
    handleCropMouseMove,
    handleCropMouseDown,
    handleCropMouseUp,
    handleCropDblClick,
    reapplyCropVisuals,
  };
}
