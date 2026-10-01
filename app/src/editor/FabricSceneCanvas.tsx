import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Canvas,
  FabricObject,
  Group as FabricGroup,
} from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";
import { resolveDragTarget } from "./fabricTargetResolution";
import { toggleShiftSelection } from "./shiftToggleSelection";
import { computeDrillEntries } from "./drillEntries";
import {
  installMultiSelectHitTesting,
  paintMultiSelectBorders,
} from "./multiSelectBorders";
import { installGroupHitTesting } from "./groupHitTest";
import {
  applyLayerToFabricObject,
  applySelectionToCanvas,
  createFabricObjectForLayer,
  isFabricObjectForLayer,
} from "./fabricAdapter";
import {
  findLayerByIdOrChild,
  findParentGroupLayer,
} from "./fabricLayerLookup";
import {
  FabricLayerTextbox,
  FabricShapeTextObject,
  registerFabricObjectClasses,
  resolveShiftLockAxis,
} from "./fabricObjects";
import {
  fabricChildrenMatch,
  sortChildrenByZIndex,
} from "./magicMove";
import { useMagicMoveDrag } from "./useMagicMoveDrag";
import { useImageCropGestures } from "./useImageCropGestures";
import { useGroupDrillIn } from "./useGroupDrillIn";
import { useGestureCommit } from "./useGestureCommit";
import { computeTextBoxSize } from "./textMetrics";
import {
  BASE_CANVAS_SCALE,
  MIN_CANVAS_ZOOM,
  type CanvasZoomCursor,
} from "./useCanvasZoom";
import {
  PASTEBOARD_DARK,
  PASTEBOARD_MARGIN_MIN,
  canonicalViewport,
  marginsForViewport,
  paintPasteboardBase,
  paintPasteboardDim,
  pasteboardElementSize,
  zoomViewport,
  type PasteboardMargins,
} from "./pasteboard";

registerFabricObjectClasses();

/** Document cluster: what is being edited and how the canvas is viewed. */
export interface FabricCanvasDocument {
  scene: Scene;
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  zoom?: number;
  zoomCursorRef?: { current: CanvasZoomCursor | null };
  /** Canvas element owned by App so the pinch-zoom handler can measure it. */
  canvasElementRef: RefObject<HTMLCanvasElement | null>;
  onSceneChange: (scene: Scene) => void;
}

/** Selection cluster: layer selection, group drill-in, context menu. */
export interface FabricCanvasSelection {
  selectedLayerIds: readonly string[];
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
  onGroupEditEnter?: (groupId: string) => void;
  onContextMenuRequest: (x: number, y: number) => void;
  /**
   * Id of the group currently drilled into (double-click a group on canvas).
   * While set, the drilled group keeps its FabricGroup on the canvas and its
   * children are edited in place; everything else is dimmed / non-interactive
   * and a Keynote-style frame traces the union of the children.
   */
  drillGroupId?: string | null;
  /** Called when the user clicks outside the drilled group to leave drill-in mode. */
  onDrillExit?: () => void;
}

/** Image-crop cluster: crop mode state lives in App, gestures on canvas. */
export interface FabricCanvasCrop {
  /** Layer id currently in image-crop mode (canvas-only interaction state). */
  croppingLayerId?: string | null;
  onImageCropEnter?: (layerId: string) => void;
  onImageCropExit?: () => void;
  onImageCropCommit?: (
    layerId: string,
    patch: { focalX: number; focalY: number; zoom: number },
  ) => void;
}

/** Text cluster: programmatic text-edit requests and text content commits. */
export interface FabricCanvasText {
  pendingTextEditLayerId?: string | null;
  onPendingTextEditConsumed?: () => void;
  onTextLayerChange?: (
    layerId: string,
    text: string,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
}

/** Animation cluster: magic-move translation commits for the animate tab. */
export interface FabricCanvasAnimation {
  selectedAnimationId?: string | null;
  onMagicMoveTranslationCommit?: (
    layerId: string,
    animationId: string,
    translateX: number,
    translateY: number,
  ) => void;
}

interface FabricSceneCanvasProps {
  document: FabricCanvasDocument;
  selection: FabricCanvasSelection;
  crop: FabricCanvasCrop;
  text: FabricCanvasText;
  animation: FabricCanvasAnimation;
}

export function FabricSceneCanvas({
  document,
  selection,
  crop,
  text,
  animation,
}: FabricSceneCanvasProps) {
  const {
    scene,
    projectId,
    projectWidth,
    projectHeight,
    displayScale = 0.5,
    zoom = 1,
    zoomCursorRef,
    canvasElementRef,
    onSceneChange,
  } = document;
  const {
    selectedLayerIds,
    onSelectedLayerIdsChange,
    onGroupEditEnter,
    onContextMenuRequest,
    drillGroupId = null,
    onDrillExit,
  } = selection;
  const {
    croppingLayerId = null,
    onImageCropEnter,
    onImageCropExit,
    onImageCropCommit,
  } = crop;
  const {
    pendingTextEditLayerId,
    onPendingTextEditConsumed,
    onTextLayerChange,
  } = text;
  const {
    selectedAnimationId,
    onMagicMoveTranslationCommit,
  } = animation;
  const fabricCanvasRef = useRef<Canvas | null>(null);
  // Pasteboard margins (scene units, per axis) folded into the viewport pan.
  // Derived from the real scroll-area size so the element fills it exactly
  // at minimum zoom; the ref is the source of truth for imperative canvas
  // ops (the measure effect can grow margins without recreating the canvas),
  // the state drives the wrapper div size.
  const [margins, setMargins] = useState<PasteboardMargins>(() => ({
    x: PASTEBOARD_MARGIN_MIN,
    y: PASTEBOARD_MARGIN_MIN,
  }));
  const marginsRef = useRef(margins);
  const elementScale = displayScale * zoom;
  const elementSceneSize = pasteboardElementSize(
    projectWidth,
    projectHeight,
    margins,
  );
  const elementWidth = elementSceneSize.width * elementScale;
  const elementHeight = elementSceneSize.height * elementScale;
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  // Shift-drag axis lock: the dragged's center when Shift is first detected
  // mid-drag, and the locked axis + the pin position of the locked-out
  // axis once the initial direction is clear.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lockOriginRef = useRef<{ left: number; top: number } | null>(null);
  const lockedAxisRef = useRef<"x" | "y" | null>(null);
  const sceneRef = useRef<Scene>(scene);
  const projectIdRef = useRef<string>(projectId);
  const contextMenuRequestRef = useRef(onContextMenuRequest);
  const isApplyingSelectionRef = useRef(false);
  const pendingTextEditRef = useRef<string | null>(null);
  const selectedLayerIdsRef = useRef<readonly string[]>(selectedLayerIds);
  const onPendingTextEditConsumedRef = useRef<
    (() => void) | undefined
  >(undefined);
  const onTextLayerChangeRef = useRef<
    ((layerId: string, text: string, width: number, height: number) => void) |
      undefined
  >(undefined);
  const [viewportTransform, setViewportTransform] = useState(() =>
    canonicalViewport(displayScale, {
      x: PASTEBOARD_MARGIN_MIN,
      y: PASTEBOARD_MARGIN_MIN,
    }),
  );
  // Derive the pasteboard margins from the real scroll-area size so the
  // element fills it exactly at minimum zoom (see marginsForViewport).
  // Runs as a layout effect: on mount it settles the margins before the
  // canvas init effect below runs, and a ResizeObserver keeps them exact
  // when the window changes. Margins only grow (monotonic): a smaller
  // window never shrinks the element, so parked layers can't get stranded
  // outside the interactive area. On growth the canvas is resized
  // imperatively and the scroll is compensated so the view doesn't jump.
  useLayoutEffect(() => {
    const area = canvasElementRef.current?.closest(".canvas-editor-area");
    if (!(area instanceof HTMLElement)) {
      return;
    }
    const syncMargins = () => {
      const rect = area.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) {
        return;
      }
      const next = marginsForViewport({
        areaWidth: rect.width,
        areaHeight: rect.height,
        minScale: BASE_CANVAS_SCALE * MIN_CANVAS_ZOOM,
        projectWidth,
        projectHeight,
      });
      const prev = marginsRef.current;
      const grown: PasteboardMargins = {
        x: Math.max(prev.x, next.x),
        y: Math.max(prev.y, next.y),
      };
      if (grown.x === prev.x && grown.y === prev.y) {
        return;
      }
      marginsRef.current = grown;
      setMargins(grown);
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        return;
      }
      const scale = canvas.viewportTransform[0];
      const size = pasteboardElementSize(projectWidth, projectHeight, grown);
      canvas.setDimensions({
        width: size.width * scale,
        height: size.height * scale,
      });
      // Shift the existing pan by the margin growth so the layout stays
      // symmetric (project centered in the element). The user's anchor is
      // preserved: a cursor-anchored zoom pan is shifted, not reset.
      const nextPanX = canvas.viewportTransform[4] + (grown.x - prev.x) * scale;
      const nextPanY = canvas.viewportTransform[5] + (grown.y - prev.y) * scale;
      canvas.setViewportTransform([scale, 0, 0, scale, nextPanX, nextPanY]);
      setViewportTransform({ scale, panX: nextPanX, panY: nextPanY });
      // Keep the same content under the viewport: the element grew by
      // (grown - prev) * scale px on the top and left.
      area.scrollLeft += (grown.x - prev.x) * scale;
      area.scrollTop += (grown.y - prev.y) * scale;
      canvas.requestRenderAll();
    };
    syncMargins();
    const observer = new ResizeObserver(() => syncMargins());
    observer.observe(area);
    return () => observer.disconnect();
  }, [canvasElementRef, projectWidth, projectHeight]);
  const {
    magicMoveContext,
    viewportPath,
    startMagicMoveDrag,
    updateMagicMoveEndpoint,
    finishMagicMoveDrag,
  } = useMagicMoveDrag({
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
  });
  const {
    drillGroupIdRef,
    syncDrillBoundary,
    applyDrillPresentation,
    isDrillFrameObject,
    invalidateDrillFrame,
    exitDrillIfActive,
    handleDrillOutsideClick,
    tryEnterDrillFromSelectedFrame,
    resolveDblClickTarget,
    tryEnterDrillForChild,
    resolveDrillDragTarget,
    recordDrillPointerDown,
    recordDrillPointerUp,
    onDrillGestureTransform,
    onDrillGestureEnd,
    repaintDrillFrame,
  } = useGroupDrillIn({
    drillGroupId,
    layerIdToObjectRef,
    objectToLayerIdRef,
    sceneRef,
    selectedLayerIdsRef,
    onGroupEditEnter,
    onDrillExit,
    onSelectedLayerIdsChange,
  });
  const { handleGestureModified } = useGestureCommit({
    objectToLayerIdRef,
    layerIdToObjectRef,
    sceneRef,
    projectIdRef,
    lockedAxisRef,
    lockOriginRef,
    isApplyingSelectionRef,
    onSceneChange,
    onDrillGestureEnd,
  });
  const {
    handleCropMouseMove,
    handleCropMouseDown,
    handleCropMouseUp,
    handleCropDblClick,
    reapplyCropVisuals,
  } = useImageCropGestures({
    croppingLayerId,
    fabricCanvasRef,
    layerIdToObjectRef,
    objectToLayerIdRef,
    sceneRef,
    drillGroupIdRef,
    onImageCropEnter,
    onImageCropExit,
    onImageCropCommit,
  });

  selectedLayerIdsRef.current = selectedLayerIds;

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    contextMenuRequestRef.current = onContextMenuRequest;
  }, [onContextMenuRequest]);

  useEffect(() => {
    pendingTextEditRef.current = pendingTextEditLayerId ?? null;
  }, [pendingTextEditLayerId]);

  useEffect(() => {
    onPendingTextEditConsumedRef.current = () => {
      onPendingTextEditConsumed?.();
    };
  }, [onPendingTextEditConsumed]);

  useEffect(() => {
    onTextLayerChangeRef.current = onTextLayerChange;
  }, [onTextLayerChange]);

  const registerTextEvents = useCallback(
    (canvas: Canvas, object: FabricObject): void => {
      if (!(object instanceof FabricLayerTextbox)) return;

      object.on("editing:exited", () => {
        const layerId = objectToLayerIdRef.current.get(object);
        if (!layerId) return;
        const currentScene = sceneRef.current;
        const layer = findLayerByIdOrChild(currentScene, layerId);
        const parentGroup = findParentGroupLayer(currentScene, layerId);
        const shapeOwner =
          object.parent instanceof FabricShapeTextObject
            ? object.parent
            : undefined;
        if (layer && shapeOwner) {
          applyLayerToFabricObject(
            shapeOwner,
            layer,
            parentGroup ?? undefined,
            projectIdRef.current,
          );
          shapeOwner.setCoords();
          canvas.requestRenderAll();
        } else if (layer) {
          applyLayerToFabricObject(
            object,
            layer,
            parentGroup ?? undefined,
            projectIdRef.current,
          );
          object.setCoords();
          canvas.requestRenderAll();
        }
      });

      object.on("editing:entered", () => {
        const layerId = objectToLayerIdRef.current.get(object);
        if (!layerId) return;
        const currentScene = sceneRef.current;
        const layer = findLayerByIdOrChild(currentScene, layerId);
        if (
          !layer ||
          (layer.type !== "text" &&
            layer.type !== "rectangle" &&
            layer.type !== "circle")
        ) return;

        const sourceText = layer.type === "text" ? layer.text : layer.shapeText.text;
        object.editSourceText = sourceText;
        if (object.text !== sourceText) {
          object.set({ text: sourceText });
        }
        if (object.hiddenTextarea && object.hiddenTextarea.value !== sourceText) {
          object.hiddenTextarea.value = sourceText;
          object.selectionStart = object.selectionEnd = sourceText.length;
          object._updateTextarea();
        }
      });

      // While drilling, typing inside a group child can change its box;
      // keep the drill frame hugging the children live.
      object.on("changed", () => {
        onDrillGestureEnd(canvas);
      });
    },
    [onDrillGestureEnd],
  );

  const addFabricObject = useCallback(
    (canvas: Canvas, layer: Layer): FabricObject => {
      const object = createFabricObjectForLayer(layer, projectIdRef.current);
      layerIdToObjectRef.current.set(layer.id, object);
      objectToLayerIdRef.current.set(object, layer.id);

      if (layer.type === "group" && object instanceof FabricGroup) {
        const sortedChildren = sortChildrenByZIndex(layer.children);
        object.getObjects().forEach((childObject, index) => {
          const child = sortedChildren[index];
          if (child) {
            layerIdToObjectRef.current.set(child.id, childObject);
            objectToLayerIdRef.current.set(childObject, child.id);
            if (childObject instanceof FabricShapeTextObject) {
              objectToLayerIdRef.current.set(childObject.textObject, child.id);
            }
          }
        });
      }

      if (object instanceof FabricShapeTextObject) {
        objectToLayerIdRef.current.set(object.textObject, layer.id);
      }

      canvas.add(object);

      registerTextEvents(canvas, object);
      if (object instanceof FabricShapeTextObject) {
        registerTextEvents(canvas, object.textObject);
      }
      if (object instanceof FabricGroup) {
        object.getObjects().forEach((childObject) => {
          registerTextEvents(canvas, childObject);
          if (childObject instanceof FabricShapeTextObject) {
            registerTextEvents(canvas, childObject.textObject);
          }
        });
      }

      return object;
    },
    [registerTextEvents],
  );

  useEffect(() => {
    const canvasElement = canvasElementRef.current;

    if (!canvasElement) {
      return;
    }

    const initElementSize = pasteboardElementSize(
      projectWidth,
      projectHeight,
      marginsRef.current,
    );
    const canvas = new Canvas(canvasElement, {
      width: initElementSize.width * displayScale,
      height: initElementSize.height * displayScale,
      // The backdrop (pasteboard base + project frame) is painted in
      // before:render; a flat backgroundColor would cover the whole
      // enlarged element and hide the project/pasteboard boundary.
      fireRightClick: true,
      selection: true,
      selectionKey: "shiftKey",
      stopContextMenu: true,
      preserveObjectStacking: true,
    });

    // Multi-select hit testing: only actual members grab the pointer, the
    // gaps between them behave as empty canvas.
    installMultiSelectHitTesting(canvas);
    // Group hit testing: same Keynote rule — the pointer must land on a
    // child inside the group to grab it; the group's empty frame gaps
    // behave as empty canvas. The drilled-in group is excluded so its
    // frame blank keeps drill semantics.
    installGroupHitTesting(canvas, {
      isDrillActiveGroup: (group) => {
        const id = objectToLayerIdRef.current.get(group);
        return id !== undefined && id === drillGroupIdRef.current;
      },
    });

    const initialViewport = canonicalViewport(
      displayScale,
      marginsRef.current,
    );
    canvas.setViewportTransform([
      initialViewport.scale,
      0,
      0,
      initialViewport.scale,
      initialViewport.panX,
      initialViewport.panY,
    ]);
    setViewportTransform(initialViewport);
    fabricCanvasRef.current = canvas;
    const objectToLayerId = objectToLayerIdRef.current;
    const layerIdToObject = layerIdToObjectRef.current;
    objectToLayerId.clear();
    layerIdToObject.clear();

    const sortedLayers = [...sceneRef.current.layers].sort(
      (first, second) => first.zIndex - second.zIndex,
    );

    for (const layer of sortedLayers) {
      addFabricObject(canvas, layer);
    }

    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      contextMenuRequestRef.current(event.clientX, event.clientY);
    };
    canvas.upperCanvasEl.addEventListener("contextmenu", handleContextMenu, true);

    const syncSelectedLayers = (): void => {
      if (isApplyingSelectionRef.current || promotedDragTarget !== null) {
        return;
      }

      const layerIds = canvas
        .getActiveObjects()
        .map((object) => objectToLayerIdRef.current.get(object))
        .filter((layerId): layerId is string => layerId !== undefined);

      onSelectedLayerIdsChange(layerIds);
    };

    canvas.on("object:modified", (event) => {
      handleGestureModified(event, canvas);
    });

    canvas.on("object:resizing", (event) => {
      const target = event.target;
      if (!(target instanceof FabricShapeTextObject)) return;
      const layerId = objectToLayerIdRef.current.get(target);
      if (!layerId) return;
      const layer = findLayerByIdOrChild(sceneRef.current, layerId);
      if (!layer || (layer.type !== "rectangle" && layer.type !== "circle")) {
        return;
      }

      const width = Math.max(1, target.width);
      const height = Math.max(1, target.height);
      target.shapeObject.set({ left: 0, top: 0, width, height });
      target.applyShapeText(layer.shapeText, width, height);
      target.shapeObject.dirty = true;
      target.dirty = true;
      target.setCoords();
      if (target.parent instanceof FabricGroup) {
        target.parent.dirty = true;
      }
      // Resizing a shape-text child changes its box; the drill frame stays
      // hidden during the gesture and re-hugs on mouse-up.
      onDrillGestureTransform(canvas);
      canvas.requestRenderAll();
    });

    canvas.on("object:moving", (event) => {
      const target = event.target;
      if (!target) return;
      if (target instanceof FabricLayerTextbox && target.isEditing) return;

      // Shift-drag axis lock: lock movement to whichever axis the user is
      // moving more on. We commit to the axis once motion clears the floor
      // (1 scene unit) so a perfectly diagonal micro-jitter at the start
      // doesn't pick the wrong axis.
      if (event.e.shiftKey) {
        if (lockedAxisRef.current === null) {
          const start = dragStartRef.current;
          if (start) {
            const rect = target.getBoundingRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const axis = resolveShiftLockAxis(start, { x: cx, y: cy }, 1);
            if (axis) {
              lockedAxisRef.current = axis;
              lockOriginRef.current = {
                left: target.left ?? 0,
                top: target.top ?? 0,
              };
            }
          }
        }
        const axis = lockedAxisRef.current;
        const origin = lockOriginRef.current;
        if (axis && origin) {
          // Re-pin the locked-out axis to where it was when Shift engaged,
          // overriding any Fabric-driven pointer translation. The dragged
          // visually only moves along the locked axis.
          if (axis === "x") {
            target.set({ top: origin.top });
          } else {
            target.set({ left: origin.left });
          }
          target.setCoords();
        }
      }
      // While drilling, the drill frame hides while a child is being
      // transformed (Keynote); it reappears fitted on mouse-up.
      onDrillGestureTransform(canvas);
    });

    canvas.on("object:scaling", () => {
      onDrillGestureTransform(canvas);
    });

    canvas.on("object:rotating", () => {
      // Rotating a child changes its bounding box; the frame stays hidden
      // during the gesture and re-hugs on mouse-up.
      onDrillGestureTransform(canvas);
    });

    canvas.on("selection:created", syncSelectedLayers);
    canvas.on("selection:updated", syncSelectedLayers);
    canvas.on("selection:cleared", syncSelectedLayers);

    // Editor backdrop: the pasteboard base and the project frame sit under
    // every object (before:render).
    canvas.on("before:render", ({ ctx }) => {
      paintPasteboardBase(canvas, ctx, {
        projectWidth,
        projectHeight,
        backgroundColor: sceneRef.current.backgroundColor ?? "#000000",
      });
    });

    canvas.on("after:render", ({ ctx }) => {
      // Pasteboard dim: everything outside the project frame (including
      // off-project objects and straddling ones' outer parts) dims to the
      // dark gray, Keynote-style. The project frame itself is never dimmed.
      paintPasteboardDim(canvas, ctx, { projectWidth, projectHeight });
      // Re-brighten chrome painted above the dim: selection controls and
      // the drill-in frame stay fully visible even off-project.
      canvas.drawControls(ctx);
      repaintDrillFrame(canvas, ctx);
      // Keynote-style multi-select: each member of an ActiveSelection paints
      // its own border + handles; there is no common outer frame.
      paintMultiSelectBorders(canvas, ctx);
    });

    canvas.on("mouse:move", (event) => {
      if (handleCropMouseMove(canvas, event)) return;
    });
    canvas.on("mouse:up", (event) => {
      lockedAxisRef.current = null;
      lockOriginRef.current = null;
      recordDrillPointerUp(event.e as MouseEvent | undefined);
      // Safety net: any child gesture that didn't end in object:modified
      // (e.g. a click without a drag) leaves the drill frame visible.
      onDrillGestureEnd(canvas);
    });
    canvas.on("mouse:dblclick", (event) => {
      // Double-click an image toggles its crop mode; images win over
      // group drill-in handling below.
      if (handleCropDblClick(event)) return;
      // Double-click a selected group's frame enters drill-in; double-click
      // a child group enters drill-in for that group.
      if (tryEnterDrillFromSelectedFrame(event, canvas)) return;
      const resolved = resolveDblClickTarget(event);
      if (!resolved) return;
      if (tryEnterDrillForChild(resolved, canvas)) return;
      const { mappedObject, child } = resolved;
      const editableText =
        mappedObject instanceof FabricShapeTextObject &&
        (child.type !== "circle" || (child.donut === 0 && child.sweep === 360))
          ? mappedObject.textObject
          : mappedObject instanceof FabricLayerTextbox
            ? mappedObject
            : undefined;
      canvas.setActiveObject(editableText ?? mappedObject);
      onSelectedLayerIdsChange([child.id]);
      if (editableText) {
        editableText.enterEditing();
        editableText.selectAll();
      }
      canvas.requestRenderAll();
    });

    let promotedDragTarget: { id: string; object: FabricObject } | null = null;
    const canonicalizeTarget = (candidate: FabricObject): FabricObject =>
      candidate.parent instanceof FabricShapeTextObject
        ? candidate.parent
        : candidate;
    const getParentTarget = (
      candidate: FabricObject,
    ): FabricObject | undefined =>
      candidate.parent instanceof FabricObject
        ? candidate.parent
        : undefined;
    canvas.on("mouse:down:before", (event) => {
      const rawTarget = event.target;
      if (!rawTarget) {
        promotedDragTarget = null;
        return;
      }

      // Drill-in: a press on a child of the drilled group drags the child
      // itself, never promoting the drag target up to the group frame.
      // When a dimmed outside object covers a drill child, the child
      // underneath wins the press.
      const drillDragTarget = resolveDrillDragTarget(rawTarget, event, canvas);
      if (drillDragTarget !== undefined) {
        promotedDragTarget = drillDragTarget;
        return;
      }

      const target = resolveDragTarget(
        rawTarget,
        selectedLayerIdsRef.current,
        canonicalizeTarget,
        getParentTarget,
        (candidate) => objectToLayerIdRef.current.get(candidate),
        (candidate) =>
          candidate instanceof FabricGroup &&
          !(candidate instanceof FabricShapeTextObject),
      );
      const targetId = objectToLayerIdRef.current.get(target);
      promotedDragTarget =
        targetId && target !== rawTarget
          ? { id: targetId, object: target }
          : null;
    });
    canvas.on("mouse:down", (event) => {
      const pointerEvent = event.e as MouseEvent;
      if (pointerEvent.button === 2) {
        pointerEvent.preventDefault();
        contextMenuRequestRef.current(
          pointerEvent.clientX,
          pointerEvent.clientY,
        );
        return;
      }
      recordDrillPointerDown(pointerEvent.clientX, pointerEvent.clientY);
      // Crop gestures take over for the cropping image: drag the zoom
      // handle to zoom, drag the (dimmed) image to pan. The frame itself
      // is locked.
      if (handleCropMouseDown(event)) return;
      if (!event.target) {
        // Keynote: clicking any blank area exits group editing and
        // deselects everything.
        exitDrillIfActive();
        onSelectedLayerIdsChange([]);
        return;
      }
      // Drill-in: a click outside the drilled group exits drill-in and
      // selects the clicked layer. Dimmed objects are not selectable, so
      // the selection is applied manually here. A promoted drill child
      // (including one underneath a dimmed outside object) already owns
      // this press, so the outside click must not fire for it.
      if (!promotedDragTarget && handleDrillOutsideClick(event)) return;
      if (promotedDragTarget) {
        const { id, object } = promotedDragTarget;
        if (pointerEvent.shiftKey) {
          // Shift+click toggles the promoted target in/out of the
          // selection instead of replacing it. Fabric's native
          // multi-select already ran above but can't know about our
          // child->group promotion, so rebuild the selection here with
          // the same toggle + group/child mutual-exclusion semantics the
          // layer tree uses, and report exactly once.
          const nextIds = toggleShiftSelection(
            selectedLayerIdsRef.current,
            id,
            sceneRef.current,
          );
          isApplyingSelectionRef.current = true;
          try {
            applySelectionToCanvas(canvas, nextIds, layerIdToObjectRef.current);
          } finally {
            isApplyingSelectionRef.current = false;
          }
          // Fully handled: mouse:up must not re-assert the single
          // promoted target over the multi-select afterwards.
          promotedDragTarget = null;
          onSelectedLayerIdsChange(nextIds);
          canvas.requestRenderAll();
        } else {
          // Fabric's own mousedown already selected the child and built the
          // correct transform for this press (a drag on first press, the
          // control's scale/rotate action once the child is selected).
          // Rebuilding it here as a drag would force every control press
          // into a move, so only fall back to the manual setup when Fabric
          // didn't already target this object.
          if (canvas._currentTransform?.target !== object) {
            canvas.setActiveObject(object);
            canvas._currentTransform = null;
            canvas._setupCurrentTransform(pointerEvent, object, false);
          }
          onSelectedLayerIdsChange([id]);
          canvas.requestRenderAll();
        }
      }
      // Record the drag start so Shift-lock can detect the initial drag
      // direction (whichever axis the user moves more on first).
      const active = canvas.getActiveObject();
      if (active) {
        const rect = active.getBoundingRect();
        dragStartRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        lockOriginRef.current = {
          left: active.left ?? 0,
          top: active.top ?? 0,
        };
        lockedAxisRef.current = null;
      }
    });
    canvas.on("mouse:up", () => {
      // End of a crop gesture: commit focal/zoom to the layer in one
      // history entry (no-op inside the hook when no gesture is active).
      handleCropMouseUp();
      if (!promotedDragTarget) {
        return;
      }
      const { id, object } = promotedDragTarget;
      const activeObject = canvas.getActiveObject();
      if (activeObject !== object) {
        canvas.setActiveObject(object);
        onSelectedLayerIdsChange([id]);
        canvas.requestRenderAll();
      }
      promotedDragTarget = null;
    });

    canvas.on("text:changed", (event) => {
      const target = event.target;
      if (!(target instanceof FabricLayerTextbox)) return;
      if (!target.isEditing) return;
      const layerId = objectToLayerIdRef.current.get(target);
      if (!layerId) return;

      const textLayer = findLayerByIdOrChild(
        sceneRef.current,
        layerId,
      );
      if (
        !textLayer ||
        (textLayer.type !== "text" &&
          textLayer.type !== "rectangle" &&
          textLayer.type !== "circle")
      ) return;

      const sourceText = textLayer.type === "text" ? textLayer.text : textLayer.shapeText.text;
      const newText = target.text ?? sourceText;
      target.editSourceText = newText;
      const measured = textLayer.type === "text"
        ? computeTextBoxSize({ ...textLayer, text: newText })
        : { width: textLayer.width, height: textLayer.height };
      if (textLayer.type === "text") {
        target.set({ width: measured.width, height: measured.height });
      }
      target.setCoords();

      onTextLayerChangeRef.current?.(
        layerId,
        newText,
        measured.width,
        measured.height,
      );
    });

    canvas.requestRenderAll();

    return () => {
      canvas.upperCanvasEl.removeEventListener("contextmenu", handleContextMenu, true);
      void canvas.dispose();
      fabricCanvasRef.current = null;
      objectToLayerId.clear();
      layerIdToObject.clear();
    };
  }, [
    addFabricObject,
    canvasElementRef,
    displayScale,
    drillGroupIdRef,
    exitDrillIfActive,
    handleCropDblClick,
    handleCropMouseDown,
    handleCropMouseMove,
    handleCropMouseUp,
    handleDrillOutsideClick,
    handleGestureModified,
    onDrillGestureEnd,
    onDrillGestureTransform,
    onSelectedLayerIdsChange,
    projectHeight,
    projectWidth,
    recordDrillPointerDown,
    recordDrillPointerUp,
    repaintDrillFrame,
    resolveDblClickTarget,
    resolveDrillDragTarget,
    scene.id,
    tryEnterDrillForChild,
    tryEnterDrillFromSelectedFrame,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const scale = displayScale * zoom;
    const cursor = zoomCursorRef?.current;
    const canvasElement = canvasElementRef.current;
    const marginsNow = marginsRef.current;
    const zoomElementSize = pasteboardElementSize(
      projectWidth,
      projectHeight,
      marginsNow,
    );

    canvas.setDimensions({
      width: zoomElementSize.width * scale,
      height: zoomElementSize.height * scale,
    });

    // Zoom toward the cursor: keep the scene point under the pointer fixed.
    // The cursor's rect was captured in the wheel handler before React
    // re-rendered; measuring here would see the already-resized
    // (flex-centered, therefore repositioned) layout paired with the old
    // viewport transform, which made pinch zoom drift.
    const rectAfter =
      cursor && canvasElement ? canvasElement.getBoundingClientRect() : null;
    const next = zoomViewport({
      prev: {
        scale: canvas.viewportTransform[0],
        panX: canvas.viewportTransform[4],
        panY: canvas.viewportTransform[5],
      },
      scale,
      margins: marginsNow,
      cursor: cursor ?? null,
      rectAfter,
    });
    // The cursor is single-use: without this, a later re-run of this effect
    // (scene switch, project resize, …) would re-apply a stale anchor and
    // jump the content. No cursor means the canonical margin-folded origin.
    if (zoomCursorRef) {
      zoomCursorRef.current = null;
    }

    canvas.setViewportTransform([
      next.scale,
      0,
      0,
      next.scale,
      next.panX,
      next.panY,
    ]);
    setViewportTransform(next);
    canvas.requestRenderAll();
  }, [
    canvasElementRef,
    displayScale,
    projectHeight,
    projectWidth,
    scene.id,
    zoom,
    zoomCursorRef,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const layerIdToObject = layerIdToObjectRef.current;
    const objectToLayerId = objectToLayerIdRef.current;
    const forgetObject = (object: FabricObject): void => {
      if (object instanceof FabricGroup) {
        object.getObjects().forEach(forgetObject);
      }
      const layerId = objectToLayerId.get(object);
      objectToLayerId.delete(object);
      if (layerId && layerIdToObject.get(layerId) === object) {
        layerIdToObject.delete(layerId);
      }
    };
    const removeAndForget = (object: FabricObject): void => {
      canvas.remove(object);
      forgetObject(object);
    };
    isApplyingSelectionRef.current = true;

    try {
      const activeObject = canvas.getActiveObject();
      const editingObject =
        activeObject instanceof FabricLayerTextbox && activeObject.isEditing
          ? activeObject
          : null;
      const editingLayerId = editingObject
        ? objectToLayerId.get(editingObject)
        : undefined;
      const editingSelection = editingObject
        ? {
            start: editingObject.selectionStart,
            end: editingObject.selectionEnd,
          }
        : null;
      if (!editingObject) {
        canvas.discardActiveObject();
      }
      // Note: the scene background is painted by paintPasteboardBase in
      // before:render (project frame only); canvas.backgroundColor must
      // stay unset so it doesn't cover the pasteboard.

      const entries = computeDrillEntries(scene.layers, drillGroupId);
      const topLevelIds = new Set(entries.map((entry) => entry.layer.id));
      const desiredLayerIds = new Set<string>();
      for (const entry of entries) {
        desiredLayerIds.add(entry.layer.id);
        if (entry.layer.type === "group") {
          entry.layer.children.forEach((child) => desiredLayerIds.add(child.id));
        }
      }

      const hasStructuralMismatch = canvas.getObjects().some((object) => {
        // The drill frame is not a layer; never treat it as a structural
        // change.
        if (isDrillFrameObject(object)) {
          return false;
        }
        const layerId = objectToLayerId.get(object);
        return layerId === undefined || !topLevelIds.has(layerId);
      });

      if (hasStructuralMismatch) {
        for (const object of [...canvas.getObjects()]) {
          canvas.remove(object);
        }
        // The removal above also drops the drill frame; clear the ref so
        // syncDrillBoundary recreates it instead of reusing the detached one.
        invalidateDrillFrame();
        objectToLayerId.clear();
        layerIdToObject.clear();

        entries.forEach((entry) => {
          const object = addFabricObject(canvas, entry.layer);
          applyDrillPresentation(entry, object);
        });

        syncDrillBoundary(canvas);
        applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);

        if (editingLayerId) {
          const editingTarget = layerIdToObject.get(editingLayerId);
          if (
            editingTarget instanceof FabricLayerTextbox &&
            !editingTarget.isEditing &&
            editingTarget.editable
          ) {
            canvas.setActiveObject(editingTarget);
            editingTarget.enterEditing();
            editingTarget.selectionStart = editingSelection?.start ?? 0;
            editingTarget.selectionEnd = editingSelection?.end ?? 0;
            if (editingTarget.hiddenTextarea) {
              editingTarget._updateTextarea();
            }
          }
        }

        canvas.requestRenderAll();
        return;
      }

      for (const [layerId, object] of layerIdToObject) {
        if (!desiredLayerIds.has(layerId)) {
          removeAndForget(object);
        }
      }

      entries.forEach((entry, index) => {
        const layer = entry.layer;
        let object = layerIdToObject.get(layer.id);

        if (object && !isFabricObjectForLayer(object, layer)) {
          removeAndForget(object);
          object = undefined;
        }

        if (
          object &&
          layer.type === "group" &&
          object instanceof FabricGroup
        ) {
          const sortedChildren = sortChildrenByZIndex(layer.children);
          if (
            !fabricChildrenMatch(
              object.getObjects(),
              sortedChildren,
              objectToLayerId,
            )
          ) {
            removeAndForget(object);
            object = undefined;
          }
        }

        if (!object) {
          object = addFabricObject(canvas, layer);
        } else if (
          layer.type === "group" &&
          object instanceof FabricGroup
        ) {
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
          const sortedChildren = sortChildrenByZIndex(layer.children);
          object.getObjects().forEach((childObject, childIndex) => {
            const child = sortedChildren[childIndex];
            if (childObject === editingObject) {
              const selStart = editingObject.selectionStart;
              const selEnd = editingObject.selectionEnd;
              applyLayerToFabricObject(childObject, child, layer, projectIdRef.current);
              editingObject.selectionStart = selStart;
              editingObject.selectionEnd = selEnd;
              if (editingObject.hiddenTextarea) {
                editingObject._updateTextarea();
              }
            } else {
              applyLayerToFabricObject(childObject, child, layer, projectIdRef.current);
            }
          });
          object.setCoords();
        } else if (object === editingObject) {
          const selStart = editingObject.selectionStart;
          const selEnd = editingObject.selectionEnd;
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
          editingObject.selectionStart = selStart;
          editingObject.selectionEnd = selEnd;
          if (editingObject.hiddenTextarea) {
            editingObject._updateTextarea();
          }
        } else {
          applyLayerToFabricObject(object, layer, undefined, projectIdRef.current);
        }

        applyDrillPresentation(entry, object);

        canvas.moveObjectTo(object, index);
      });

      // Hug the drilled group's children with the drill frame (or remove the
      // frame when drill-in ends).
      syncDrillBoundary(canvas);

      // Scene sync does not know about crop mode; re-apply the canvas-only
      // crop visuals so a sync (e.g. the crop commit itself) never drops
      // them mid-session.
      reapplyCropVisuals(layerIdToObject);

      if (!editingObject) {
        applySelectionToCanvas(canvas, selectedLayerIds, layerIdToObject);
      }

      const pendingId = pendingTextEditRef.current;
      if (pendingId) {
        const target = layerIdToObject.get(pendingId);
        if (
          target instanceof FabricLayerTextbox &&
          !target.isEditing &&
          target.editable
        ) {
          canvas.setActiveObject(target);
          target.enterEditing();
          target.selectAll();
        }
        pendingTextEditRef.current = null;
        onPendingTextEditConsumedRef.current?.();
      }

      canvas.requestRenderAll();
    } finally {
      isApplyingSelectionRef.current = false;
    }
  }, [addFabricObject, applyDrillPresentation, drillGroupId, invalidateDrillFrame, isDrillFrameObject, reapplyCropVisuals, scene, selectedLayerIds, syncDrillBoundary]);

  const canvasWidth = elementWidth;
  const canvasHeight = elementHeight;

  return (
    <div
      style={{
        position: "relative",
        width: canvasWidth,
        height: canvasHeight,
        overflow: "hidden",
        background: PASTEBOARD_DARK,
      }}
    >
      <canvas ref={canvasElementRef} />
      {magicMoveContext && viewportPath ? (
        <>
          <svg
            className="magic-move-overlay"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden="true"
          >
            <line
              x1={viewportPath.start.x}
              y1={viewportPath.start.y}
              x2={viewportPath.end.x}
              y2={viewportPath.end.y}
              className="magic-move-path-line"
            />
            <circle
              cx={viewportPath.start.x}
              cy={viewportPath.start.y}
              r={5}
              className="magic-move-path-origin"
            />
            <rect
              x={
                viewportPath.end.x -
                (magicMoveContext.layer.width *
                  magicMoveContext.animation.scale *
                  viewportTransform.scale) /
                  2
              }
              y={
                viewportPath.end.y -
                (magicMoveContext.layer.height *
                  magicMoveContext.animation.scale *
                  viewportTransform.scale) /
                  2
              }
              width={
                magicMoveContext.layer.width *
                magicMoveContext.animation.scale *
                viewportTransform.scale
              }
              height={
                magicMoveContext.layer.height *
                magicMoveContext.animation.scale *
                viewportTransform.scale
              }
              transform={`rotate(${magicMoveContext.layer.rotation + (magicMoveContext.parentGroup?.rotation ?? 0)} ${viewportPath.end.x} ${viewportPath.end.y})`}
              className="magic-move-target-outline"
            />
          </svg>
          <button
            type="button"
            className="magic-move-target-handle"
            aria-label="Drag Magic Move target"
            title="Drag to set the Magic Move endpoint"
            style={{
              left: viewportPath.end.x,
              top: viewportPath.end.y,
            }}
            onPointerDown={startMagicMoveDrag}
            onPointerMove={updateMagicMoveEndpoint}
            onPointerUp={(event) => finishMagicMoveDrag(event, true)}
            onPointerCancel={(event) => finishMagicMoveDrag(event, false)}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
