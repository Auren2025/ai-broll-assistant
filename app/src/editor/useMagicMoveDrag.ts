import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Canvas, FabricObject } from "fabric";
import type { Scene } from "../domain/sceneSchema";
import { applySelectionToCanvas } from "./fabricAdapter";
import { findLayerByIdOrChild, findParentGroupLayer } from "./fabricLayerLookup";
import {
  resolveMagicMoveContext,
  roundNumber,
  type MagicMoveContext,
} from "./magicMove";
import {
  getMagicMovePath,
  getMagicMoveTranslationForEndpoint,
} from "./magicMoveGeometry";

export interface MagicMoveViewport {
  scale: number;
  panX: number;
  panY: number;
}

export interface MagicMovePoint {
  x: number;
  y: number;
}

interface MagicMoveDraft {
  layerId: string;
  animationId: string;
  translateX: number;
  translateY: number;
}

interface UseMagicMoveDragOptions {
  scene: Scene;
  selectedLayerIds: readonly string[];
  selectedAnimationId: string | null | undefined;
  viewportTransform: MagicMoveViewport;
  fabricCanvasRef: RefObject<Canvas | null>;
  sceneRef: RefObject<Scene>;
  selectedLayerIdsRef: RefObject<readonly string[]>;
  layerIdToObjectRef: RefObject<Map<string, FabricObject>>;
  isApplyingSelectionRef: RefObject<boolean>;
  onMagicMoveTranslationCommit?: (
    layerId: string,
    animationId: string,
    translateX: number,
    translateY: number,
  ) => void;
}

export interface MagicMoveDrag {
  /** Resolved layer+animation the handle controls, null when no magic-move is active. */
  magicMoveContext: MagicMoveContext | null;
  /** Viewport-space start/end of the motion path, for the overlay. */
  viewportPath: { start: MagicMovePoint; end: MagicMovePoint } | null;
  /** onPointerDown on the target handle: captures the pointer and freezes the canvas. */
  startMagicMoveDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** onPointerMove on the target handle: updates the draft translation. */
  updateMagicMoveEndpoint: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** onPointerUp/Cancel: commits (or discards) the draft and restores the canvas. */
  finishMagicMoveDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) => void;
}

/**
 * Owns the Magic Move target-handle drag state machine: the draft
 * translation, the in-flight pointer drag, and the canvas freeze/restore
 * around it. Rendered overlay (SVG path + handle button) stays with the
 * canvas component; this hook provides the context, path, and handlers.
 */
export function useMagicMoveDrag(
  options: UseMagicMoveDragOptions,
): MagicMoveDrag {
  const {
    scene,
    selectedLayerIds,
    selectedAnimationId,
    viewportTransform,
    fabricCanvasRef,
    sceneRef,
    selectedLayerIdsRef,
    layerIdToObjectRef,
    isApplyingSelectionRef,
    onMagicMoveTranslationCommit,
  } = options;

  const [magicMoveDraft, setMagicMoveDraft] = useState<MagicMoveDraft | null>(
    null,
  );
  const magicMoveDraftRef = useRef(magicMoveDraft);
  const magicMoveDragRef = useRef<{
    pointerId: number;
    layerId: string;
    animationId: string;
  } | null>(null);
  const magicMoveRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  function resetDragState(): void {
    if (magicMoveRestoreTimerRef.current !== null) {
      clearTimeout(magicMoveRestoreTimerRef.current);
      magicMoveRestoreTimerRef.current = null;
    }
    magicMoveDraftRef.current = null;
    magicMoveDragRef.current = null;
    setMagicMoveDraft(null);
  }

  function restoreCanvasSelection(): void {
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      canvas.upperCanvasEl.style.pointerEvents = "";
      canvas._currentTransform = null;
      canvas.selection = true;
      canvas.skipTargetFind = false;
      isApplyingSelectionRef.current = true;
      applySelectionToCanvas(
        canvas,
        selectedLayerIdsRef.current,
        layerIdToObjectRef.current,
      );
      canvas.requestRenderAll();
      isApplyingSelectionRef.current = false;
    }
  }

  // When the scene or the active animation changes, reset the canvas to its
  // normal editing state and cancel any in-flight magic-move handle drag.
  // A scene/animation change means the user has left the previous editing
  // context and any leftover drag state would be stale.
  useEffect(() => {
    resetDragState();
    restoreCanvasSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, selectedAnimationId]);

  // When the user selects a different layer, only cancel any in-flight
  // magic-move handle drag state. Do NOT touch the canvas internals
  // (`_currentTransform`, selection, skipTargetFind, ...): `mouse:down` has
  // just set up a drag via `_setupCurrentTransform`, and nulling
  // `_currentTransform` here would silently cancel the drag, making the
  // freshly-selected layer look selected but un-draggable. The heavy sync
  // effect already reapplies selection on this change.
  useEffect(() => {
    resetDragState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerIds]);

  // Unmount: drop any in-flight drag state and clear the restore timer.
  useEffect(() => {
    return () => {
      if (magicMoveRestoreTimerRef.current !== null) {
        clearTimeout(magicMoveRestoreTimerRef.current);
        magicMoveRestoreTimerRef.current = null;
      }
      magicMoveDraftRef.current = null;
      magicMoveDragRef.current = null;
    };
  }, []);

  const magicMoveContext = resolveMagicMoveContext(
    scene,
    selectedLayerIds,
    selectedAnimationId,
  );
  const activeMagicMoveDraft =
    magicMoveContext &&
    magicMoveDraft?.layerId === magicMoveContext.layer.id &&
    magicMoveDraft.animationId === magicMoveContext.animation.id
      ? magicMoveDraft
      : null;
  const magicMoveTranslation = magicMoveContext
    ? {
        x:
          activeMagicMoveDraft?.translateX ??
          magicMoveContext.animation.translateX,
        y:
          activeMagicMoveDraft?.translateY ??
          magicMoveContext.animation.translateY,
      }
    : null;
  const magicMovePath =
    magicMoveContext && magicMoveTranslation
      ? getMagicMovePath(
          magicMoveContext.layer,
          magicMoveTranslation,
          magicMoveContext.parentGroup ?? undefined,
        )
      : null;
  const toViewport = (point: MagicMovePoint): MagicMovePoint => ({
    x: point.x * viewportTransform.scale + viewportTransform.panX,
    y: point.y * viewportTransform.scale + viewportTransform.panY,
  });
  const viewportPath = magicMovePath
    ? {
        start: toViewport(magicMovePath.start),
        end: toViewport(magicMovePath.end),
      }
    : null;

  function startMagicMoveDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const canvas = fabricCanvasRef.current;
    if (canvas) {
      if (magicMoveRestoreTimerRef.current !== null) {
        clearTimeout(magicMoveRestoreTimerRef.current);
        magicMoveRestoreTimerRef.current = null;
      }
      isApplyingSelectionRef.current = true;
      canvas._currentTransform = null;
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.discardActiveObject();
      canvas.upperCanvasEl.style.pointerEvents = "none";
      canvas.requestRenderAll();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (magicMoveContext) {
      magicMoveDragRef.current = {
        pointerId: event.pointerId,
        layerId: magicMoveContext.layer.id,
        animationId: magicMoveContext.animation.id,
      };
    }
  }

  function updateMagicMoveEndpoint(
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    const drag = magicMoveDragRef.current;
    const canvas = fabricCanvasRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return;
    const currentScene = sceneRef.current;
    const layer = findLayerByIdOrChild(currentScene, drag.layerId);
    if (!layer) return;
    const parentGroup = findParentGroupLayer(currentScene, drag.layerId);
    const bounds = canvas.upperCanvasEl.getBoundingClientRect();
    const transform = canvas.viewportTransform;
    const endpoint = {
      x: (event.clientX - bounds.left - transform[4]) / transform[0],
      y: (event.clientY - bounds.top - transform[5]) / transform[3],
    };
    const translation = getMagicMoveTranslationForEndpoint(
      layer,
      endpoint,
      parentGroup ?? undefined,
    );
    const draft = {
      layerId: drag.layerId,
      animationId: drag.animationId,
      translateX: roundNumber(translation.x),
      translateY: roundNumber(translation.y),
    };
    magicMoveDraftRef.current = draft;
    setMagicMoveDraft(draft);
  }

  function finishMagicMoveDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ): void {
    const drag = magicMoveDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const draft = magicMoveDraftRef.current;
    magicMoveDragRef.current = null;
    magicMoveDraftRef.current = null;
    setMagicMoveDraft(null);
    if (
      commit &&
      draft &&
      draft.layerId === drag.layerId &&
      draft.animationId === drag.animationId
    ) {
      onMagicMoveTranslationCommit?.(
        drag.layerId,
        drag.animationId,
        draft.translateX,
        draft.translateY,
      );
    }
    if (magicMoveRestoreTimerRef.current !== null) {
      clearTimeout(magicMoveRestoreTimerRef.current);
    }
    magicMoveRestoreTimerRef.current = setTimeout(() => {
      restoreCanvasSelection();
      isApplyingSelectionRef.current = false;
      magicMoveRestoreTimerRef.current = null;
    }, 100);
  }

  return {
    magicMoveContext,
    viewportPath,
    startMagicMoveDrag,
    updateMagicMoveEndpoint,
    finishMagicMoveDrag,
  };
}
