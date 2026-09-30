import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ActiveSelection,
  Canvas,
  FabricObject,
  Group as FabricGroup,
  Rect,
} from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";
import { hugGroupToChildren } from "../domain/groupOperations";
import { resolveDragTarget } from "./fabricTargetResolution";
import {
  DRILL_DIM_FACTOR,
  computeDrillEntries,
  isLayerInDrillScope,
  type DrillEntry,
} from "./drillEntries";
import {
  applyLayerToFabricObject,
  applySelectionToCanvas,
  createFabricObjectForLayer,
  isFabricObjectForLayer,
  setImageCropMode,
  updateChildLayerFromFabricObject,
  updateLayerFromFabricObject,
} from "./fabricAdapter";
import {
  findLayerByIdOrChild,
  findParentGroupLayer,
} from "./fabricLayerLookup";
import {
  FabricLayerTextbox,
  FabricShapeTextObject,
  FabricImageLayerObject,
  registerFabricObjectClasses,
  resolveShiftLockAxis,
} from "./fabricObjects";
import {
  fabricChildrenMatch,
  resolveMagicMoveContext,
  roundNumber,
  sortChildrenByZIndex,
} from "./magicMove";
import {
  getMagicMovePath,
  getMagicMoveTranslationForEndpoint,
} from "./magicMoveGeometry";
import { clampFocal, clampImageCropZoom } from "./imageCrop";
import { computeTextBoxSize } from "./textMetrics";

registerFabricObjectClasses();

/**
 * Pointer travel (CSS px) within a single press that counts as a drag. A
 * press that moves less than this is a click. Used to tell a true
 * double-click apart from drag-then-click: browsers fire `dblclick` for
 * both, but a drag-then-click must not enter group drill-in.
 */
const DRAG_VS_CLICK_PX = 5;

interface FabricSceneCanvasProps {
  scene: Scene;
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  displayScale?: number;
  zoom?: number;
  zoomCursorRef?: { current: { x: number; y: number } | null };
  onSceneChange: (scene: Scene) => void;
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
  onHoveredLayerIdChange: (layerId: string | null) => void;
  onGroupEditEnter?: (groupId: string) => void;
  onContextMenuRequest: (x: number, y: number) => void;
  selectedLayerIds: readonly string[];
  /**
   * Id of the group currently drilled into (double-click a group on canvas).
   * While set, the drilled group keeps its FabricGroup on the canvas and its
   * children are edited in place; everything else is dimmed / non-interactive
   * and a Keynote-style frame traces the union of the children.
   */
  drillGroupId?: string | null;
  /** Called when the user clicks outside the drilled group to leave drill-in mode. */
  onDrillExit?: () => void;
  selectedAnimationId?: string | null;
  onMagicMoveTranslationCommit?: (
    layerId: string,
    animationId: string,
    translateX: number,
    translateY: number,
  ) => void;
  pendingTextEditLayerId?: string | null;
  onPendingTextEditConsumed?: () => void;
  onTextLayerChange?: (
    layerId: string,
    text: string,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
  /** Layer id currently in image-crop mode (canvas-only interaction state). */
  croppingLayerId?: string | null;
  onImageCropEnter?: (layerId: string) => void;
  onImageCropExit?: () => void;
  onImageCropCommit?: (
    layerId: string,
    patch: { focalX: number; focalY: number; zoom: number },
  ) => void;
}

export function FabricSceneCanvas({
  scene,
  projectId,
  projectWidth,
  projectHeight,
  displayScale = 0.5,
  zoom = 1,
  zoomCursorRef,
  onSceneChange,
  onSelectedLayerIdsChange,
  onHoveredLayerIdChange,
  onGroupEditEnter,
  onContextMenuRequest,
  selectedLayerIds,
  drillGroupId = null,
  onDrillExit,
  selectedAnimationId,
  onMagicMoveTranslationCommit,
  pendingTextEditLayerId,
  onPendingTextEditConsumed,
  onTextLayerChange,
  croppingLayerId = null,
  onImageCropEnter,
  onImageCropExit,
  onImageCropCommit,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  const hoveredObjectRef = useRef<FabricObject | null>(null);
  // Distinguish a true double-click from drag-then-click: browsers fire
  // `dblclick` for both, but only the former may enter group drill-in.
  // pointerDownPosRef records where the current press started; each
  // pointer-up records whether that press was a drag (moved beyond a few
  // px). At `dblclick` time the second-to-last entry is the first click of
  // the pair.
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const recentPointerUpsRef = useRef<{ dragged: boolean }[]>([]);
  // Shift-drag axis lock: the dragged's center when Shift is first detected
  // mid-drag, and the locked axis + the pin position of the locked-out
  // axis once the initial direction is clear.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lockOriginRef = useRef<{ left: number; top: number } | null>(null);
  const lockedAxisRef = useRef<"x" | "y" | null>(null);
  const sceneRef = useRef<Scene>(scene);
  const projectIdRef = useRef<string>(projectId);
  const contextMenuRequestRef = useRef(onContextMenuRequest);
  const groupEditEnterRef = useRef(onGroupEditEnter);
  const drillGroupIdRef = useRef<string | null>(drillGroupId);
  const onDrillExitRef = useRef(onDrillExit);
  // Drill frame shown while drilling: a Keynote-style non-interactive frame
  // (thin solid border + 8 square handles) that hugs the union of the drilled
  // group's children and follows them live. It is not a layer, so it stays
  // out of the layer<->object maps and the structural-diff check.
  // Index 0 is the border rect; the rest are the corner/edge handles.
  const drillFrameRef = useRef<Rect | null>(null);
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
  // Image crop mode: which layer is being cropped, the active pan/zoom
  // gesture, and the latest prop callbacks (mirrored to refs so the
  // long-lived canvas handlers never close over stale values).
  const croppingLayerIdRef = useRef<string | null>(croppingLayerId);
  const onImageCropEnterRef = useRef(onImageCropEnter);
  const onImageCropExitRef = useRef(onImageCropExit);
  const onImageCropCommitRef = useRef(onImageCropCommit);
  const cropSessionRef = useRef<
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
      }
    | null
  >(null);
  const prevCroppingLayerIdRef = useRef<string | null>(null);
  const [viewportTransform, setViewportTransform] = useState({
    scale: displayScale,
    panX: 0,
    panY: 0,
  });
  const [magicMoveDraft, setMagicMoveDraft] = useState<{
    layerId: string;
    animationId: string;
    translateX: number;
    translateY: number;
  } | null>(null);
  const magicMoveDraftRef = useRef(magicMoveDraft);
  const magicMoveDragRef = useRef<{
    pointerId: number;
    layerId: string;
    animationId: string;
  } | null>(null);
  const magicMoveRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
    groupEditEnterRef.current = onGroupEditEnter;
  }, [onGroupEditEnter]);

  useEffect(() => {
    if (drillGroupIdRef.current !== drillGroupId) {
      // Entering or exiting drill-in invalidates hover state: the purple
      // hover border would otherwise linger (e.g. blank-click exits drill
      // without any mousemove to clear it).
      hoveredObjectRef.current = null;
      onHoveredLayerIdChange(null);
      fabricCanvasRef.current?.requestRenderAll();
    }
    drillGroupIdRef.current = drillGroupId;
  }, [drillGroupId, onHoveredLayerIdChange]);

  useEffect(() => {
    onDrillExitRef.current = onDrillExit;
  }, [onDrillExit]);

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
  }, [croppingLayerId]);

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

  // Effect: when the scene or the active animation changes, reset the canvas
  // to its normal editing state and cancel any in-flight magic-move handle
  // drag. This is the only place we should null `_currentTransform`, because
  // a scene/animation change means the user has left the previous editing
  // context and any leftover drag state would be stale.
  useEffect(() => {
    if (magicMoveRestoreTimerRef.current !== null) {
      clearTimeout(magicMoveRestoreTimerRef.current);
      magicMoveRestoreTimerRef.current = null;
    }
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
    magicMoveDraftRef.current = null;
    magicMoveDragRef.current = null;
    setMagicMoveDraft(null);
  }, [scene.id, selectedAnimationId]);

  // Effect: when the user selects a different layer, only cancel any
  // in-flight magic-move handle drag state. Do NOT touch the canvas
  // internals (`_currentTransform`, selection, skipTargetFind, ...):
  // `mouse:down` has just set up a drag via `_setupCurrentTransform`,
  // and nulling `_currentTransform` here would silently cancel the drag,
  // making the freshly-selected layer look selected but un-draggable.
  // The heavy sync effect already reapplies selection on this change.
  useEffect(() => {
    if (magicMoveRestoreTimerRef.current !== null) {
      clearTimeout(magicMoveRestoreTimerRef.current);
      magicMoveRestoreTimerRef.current = null;
    }
    magicMoveDraftRef.current = null;
    magicMoveDragRef.current = null;
    setMagicMoveDraft(null);
  }, [selectedLayerIds]);

  const syncObjectsToScene = useCallback(
    (objects: readonly FabricObject[]): void => {
      const objectByLayerId = new Map<string, FabricObject>();

      for (const object of objects) {
        const layerId = objectToLayerIdRef.current.get(object);

        if (layerId) {
          objectByLayerId.set(layerId, object);
        }
      }

      if (objectByLayerId.size === 0) {
        return;
      }

      const currentScene = sceneRef.current;
      const updatedScene: Scene = {
        ...currentScene,
        layers: currentScene.layers.map((layer) => {
          if (layer.type === "group") {
            const groupObject = objectByLayerId.get(layer.id);
            const nextGroup = groupObject
              ? updateLayerFromFabricObject(layer, groupObject)
              : layer;
            if (nextGroup.type !== "group") return nextGroup;
            let childChanged = false;
            const children = nextGroup.children.map((child) => {
              const childObject = objectByLayerId.get(child.id);
              if (!childObject) return child;
              childChanged = true;
              return updateChildLayerFromFabricObject(
                nextGroup,
                child,
                childObject,
              );
            });
            return childChanged
              ? hugGroupToChildren({ ...nextGroup, children })
              : nextGroup;
          }
          const object = objectByLayerId.get(layer.id);
          return object ? updateLayerFromFabricObject(layer, object) : layer;
        }),
      };

      sceneRef.current = updatedScene;
      onSceneChange(updatedScene);
    },
    [onSceneChange],
  );

  /**
   * Keep the drill frame in sync with the drilled group (Keynote): a plain
   * white border hugging the children's union while drilling, removed when
   * drill-in ends. The border hides while a child is being dragged and
   * reappears fitted once the gesture completes. Called after every scene
   * sync and on gesture end.
   */
  const syncDrillBoundary = useCallback((canvas: Canvas): void => {
    const drillId = drillGroupIdRef.current;
    const groupObject =
      drillId != null ? layerIdToObjectRef.current.get(drillId) : undefined;
    const clearFrame = (): void => {
      const frame = drillFrameRef.current;
      if (frame) {
        canvas.remove(frame);
        drillFrameRef.current = null;
      }
    };
    if (!(groupObject instanceof FabricGroup)) {
      clearFrame();
      return;
    }
    // The drill frame traces the group's own frame exactly — the same
    // boundary the blue selection shows, in white without handles. Using the
    // group frame (not a recomputed children union) keeps the drill frame,
    // the selection frame, and the schema frame in agreement for rotated
    // groups and hidden children alike: no extra padding, no
    // visibility filtering, rotation included.
    groupObject.setCoords();
    let frame = drillFrameRef.current;
    if (!frame) {
      frame = new Rect({
        originX: "center",
        originY: "center",
        fill: "rgba(0,0,0,0)",
        // Plain white border (Keynote): marks the drill scope, distinct
        // from the purple selection border. No handles — the frame is not
        // interactive.
        stroke: "#ffffff",
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        hoverCursor: "default",
      });
      canvas.add(frame);
      drillFrameRef.current = frame;
    }
    frame.set({
      left: groupObject.left,
      top: groupObject.top,
      width: groupObject.width,
      height: groupObject.height,
      scaleX: groupObject.scaleX,
      scaleY: groupObject.scaleY,
      angle: groupObject.angle,
      flipX: groupObject.flipX,
      flipY: groupObject.flipY,
      visible: true,
    });
    frame.setCoords();
    canvas.bringObjectToFront(frame);
    canvas.requestRenderAll();
  }, []);

  /**
   * Show/hide the drill frame without recomputing it. Used to hide the
   * border while a child is being dragged (Keynote).
   */
  const setDrillFrameVisible = useCallback(
    (canvas: Canvas, visible: boolean): void => {
      const frame = drillFrameRef.current;
      if (!frame) return;
      frame.set({ visible });
      canvas.requestRenderAll();
    },
    [],
  );

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
        if (drillGroupIdRef.current) {
          syncDrillBoundary(canvas);
        }
      });
    },
    [syncDrillBoundary],
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

    const canvas = new Canvas(canvasElement, {
      width: projectWidth * displayScale,
      height: projectHeight * displayScale,
      backgroundColor: sceneRef.current.backgroundColor ?? "#000000",
      fireRightClick: true,
      selection: true,
      selectionKey: "shiftKey",
      stopContextMenu: true,
      preserveObjectStacking: true,
    });

    canvas.setViewportTransform([displayScale, 0, 0, displayScale, 0, 0]);
    setViewportTransform({ scale: displayScale, panX: 0, panY: 0 });
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
      lockedAxisRef.current = null;
      lockOriginRef.current = null;
      const target = event.target;

      if (!target) {
        return;
      }
      if (
        target instanceof FabricLayerTextbox &&
        target.parent instanceof FabricShapeTextObject
      ) return;

      if (target instanceof ActiveSelection) {
        const selectedObjects = target.getObjects();
        const selectedIds = selectedObjects
          .map((object) => objectToLayerIdRef.current.get(object))
          .filter((layerId): layerId is string => layerId !== undefined);

        const spaces = new Set(
          selectedObjects.map((object) => {
            const parent = object.parent;
            if (parent instanceof FabricGroup) {
              return objectToLayerIdRef.current.get(parent) ?? "scene";
            }
            return "scene";
          }),
        );

        queueMicrotask(() => {
          isApplyingSelectionRef.current = true;

          try {
            canvas.discardActiveObject();

            if (spaces.size > 1) {
              const currentScene = sceneRef.current;
              for (const selectedObject of selectedObjects) {
                const layerId = objectToLayerIdRef.current.get(selectedObject);
                if (!layerId) continue;
                const layer = findLayerByIdOrChild(currentScene, layerId);
                const parentGroup = findParentGroupLayer(currentScene, layerId);
                if (layer) {
                  applyLayerToFabricObject(
                    selectedObject,
                    layer,
                    parentGroup ?? undefined,
                    projectIdRef.current,
                  );
                }
              }
            } else {
              syncObjectsToScene(selectedObjects);
            }

            applySelectionToCanvas(
              canvas,
              selectedIds,
              layerIdToObjectRef.current,
            );
            // The gesture is done: re-show the drill frame, fitted to the
            // children's new union.
            if (drillGroupIdRef.current) {
              syncDrillBoundary(canvas);
            }
            canvas.requestRenderAll();
          } finally {
            isApplyingSelectionRef.current = false;
          }
        });
        return;
      }

      syncObjectsToScene([target]);
      // The gesture is done: re-show the drill frame, fitted to the
      // children's new union.
      if (drillGroupIdRef.current) {
        syncDrillBoundary(canvas);
      }
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
      if (drillGroupIdRef.current) {
        setDrillFrameVisible(canvas, false);
      }
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
      if (drillGroupIdRef.current) {
        setDrillFrameVisible(canvas, false);
      }
    });

    canvas.on("object:scaling", () => {
      if (drillGroupIdRef.current) {
        setDrillFrameVisible(canvas, false);
      }
    });

    canvas.on("object:rotating", () => {
      // Rotating a child changes its bounding box; the frame stays hidden
      // during the gesture and re-hugs on mouse-up.
      if (drillGroupIdRef.current) {
        setDrillFrameVisible(canvas, false);
      }
    });

    canvas.on("selection:created", syncSelectedLayers);
    canvas.on("selection:updated", syncSelectedLayers);
    canvas.on("selection:cleared", syncSelectedLayers);
    const resolveHoverTarget = (
      target: FabricObject | null | undefined,
    ): FabricObject | null => {
      if (!target) return null;
      const parent = target.parent;
      return parent instanceof FabricGroup ? parent : target;
    };

    canvas.on("mouse:move", (event) => {
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
            return;
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
            return;
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
            return;
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
            return;
          }
        }
      }
      const hoverTarget = resolveHoverTarget(event.target);
      if (hoverTarget === hoveredObjectRef.current) return;

      hoveredObjectRef.current = hoverTarget;
      onHoveredLayerIdChange(
        hoverTarget
          ? (objectToLayerIdRef.current.get(hoverTarget) ?? null)
          : null,
      );
      canvas.requestRenderAll();
    });
    canvas.on("mouse:out", () => {
      if (!hoveredObjectRef.current) return;

      hoveredObjectRef.current = null;
      onHoveredLayerIdChange(null);
      canvas.requestRenderAll();
    });
    canvas.on("after:render", ({ ctx }) => {
      const hoveredObject = hoveredObjectRef.current;
      // During drill-in, hovering a child resolves to the drilled group;
      // never paint a hover border for the group being drilled.
      const hoveredLayerId = hoveredObject
        ? objectToLayerId.get(hoveredObject)
        : undefined;
      if (
        !hoveredObject ||
        !hoveredObject.visible ||
        !canvas.getObjects().includes(hoveredObject) ||
        // Never outline an object the layer map no longer knows: a stale
        // reference must not paint a ghost border.
        hoveredLayerId === undefined ||
        canvas.getActiveObjects().includes(hoveredObject) ||
        (drillGroupIdRef.current !== null &&
          hoveredLayerId === drillGroupIdRef.current)
      ) {
        return;
      }

      hoveredObject._renderControls(ctx, {
        borderColor: "#7147e8",
        hasBorders: true,
        hasControls: false,
      });
    });
    canvas.on("mouse:up", (event) => {
      lockedAxisRef.current = null;
      lockOriginRef.current = null;
      // Record whether this press was a drag: a drag-then-click still fires
      // `dblclick` in the browser, but must not enter group drill-in.
      const pointerEvent = event.e as MouseEvent | undefined;
      const downPos = pointerDownPosRef.current;
      const dragged =
        pointerEvent != null && downPos != null
          ? Math.hypot(
              pointerEvent.clientX - downPos.x,
              pointerEvent.clientY - downPos.y,
            ) > DRAG_VS_CLICK_PX
          : false;
      const ups = recentPointerUpsRef.current;
      ups.push({ dragged });
      if (ups.length > 2) ups.shift();
      pointerDownPosRef.current = null;
      // Safety net: any child gesture that didn't end in object:modified
      // (e.g. a click without a drag) leaves the drill frame visible.
      if (drillGroupIdRef.current) {
        syncDrillBoundary(canvas);
      }
    });
    // A drag-then-click (or click-then-drag) still fires `dblclick` in the
    // browser: Chrome synthesizes a click on mouseup when the press started
    // and ended on the same element, even after movement — e.g. a macOS
    // three-finger drag ending near its start point pairs with the earlier
    // tap's click. At dblclick time the last two pointer-ups are the pair:
    // if either press was a drag, this is not a true double-click and must
    // not enter group drill-in.
    const isDragThenClickDblClick = (): boolean => {
      const ups = recentPointerUpsRef.current;
      if (ups.length < 2) return false;
      return ups[ups.length - 2]?.dragged === true ||
        ups[ups.length - 1]?.dragged === true;
    };
    canvas.on("mouse:dblclick", (event) => {
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
          return;
        }
      }
      const selectedLayerId = selectedLayerIdsRef.current.length === 1
        ? selectedLayerIdsRef.current[0]
        : null;
      const selectedObject =
        selectedLayerId
          ? layerIdToObjectRef.current.get(selectedLayerId)
          : undefined;
      const selectedLayer = selectedLayerId
        ? findLayerByIdOrChild(sceneRef.current, selectedLayerId)
        : null;
      if (
        selectedObject &&
        selectedLayer?.type === "group" &&
        selectedObject.containsPoint(event.scenePoint)
      ) {
        // Drill-in: the group frame stays on the canvas as a boundary
        // overlay while its children become directly editable. Nothing is
        // selected on entry; the overlay marks the drill scope. A
        // drag-then-click is not a true double-click: don't drill in.
        if (isDragThenClickDblClick()) return;
        groupEditEnterRef.current?.(selectedLayer.id);
        onSelectedLayerIdsChange([]);
        canvas.requestRenderAll();
        return;
      }
      const selectedChildWasHit =
        selectedObject?.parent instanceof FabricGroup &&
        selectedObject.containsPoint(event.scenePoint);
      const childObject = selectedChildWasHit
        ? selectedObject
        : [...(event.subTargets ?? []), event.target]
            .reverse()
            .find((candidate) => {
              let current = candidate;
              while (current) {
                if (objectToLayerIdRef.current.has(current)) return true;
                current = current.parent;
              }
              return false;
            });
      if (!childObject) return;
      let mappedObject: FabricObject | undefined = childObject;
      while (mappedObject && !objectToLayerIdRef.current.has(mappedObject)) {
        mappedObject = mappedObject.parent;
      }
      if (!mappedObject) return;
      const childId = objectToLayerIdRef.current.get(mappedObject);
      const child = childId
        ? findLayerByIdOrChild(sceneRef.current, childId)
        : undefined;
      if (!child || child.locked) return;
      if (child.type === "group") {
        // Already drilling this group: double-clicking its empty area is a
        // no-op (the drill frame already marks the drill scope).
        if (drillGroupIdRef.current === child.id) return;
        // A drag-then-click is not a true double-click: don't drill in.
        if (isDragThenClickDblClick()) return;
        canvas.setActiveObject(mappedObject);
        onSelectedLayerIdsChange([child.id]);
        groupEditEnterRef.current?.(child.id);
        canvas.requestRenderAll();
        return;
      }
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

      const drillId = drillGroupIdRef.current;
      if (drillId) {
        // While drilling, a press on a child of the drilled group drags the
        // child itself: never promote the drag target up to the group frame.
        let candidate: FabricObject | undefined =
          canonicalizeTarget(rawTarget);
        while (
          candidate &&
          !objectToLayerIdRef.current.has(candidate)
        ) {
          candidate = getParentTarget(candidate);
        }
        const candidateId = candidate
          ? objectToLayerIdRef.current.get(candidate)
          : undefined;
        const candidateLayer =
          candidateId != null
            ? findLayerByIdOrChild(sceneRef.current, candidateId)
            : undefined;
        const parentGroup =
          candidateId != null
            ? findParentGroupLayer(sceneRef.current, candidateId)
            : null;
        if (candidate && parentGroup && parentGroup.id === drillId) {
          // Select the child immediately and drag it, mirroring the
          // promotion path below but without promoting to the group frame.
          // Locked children stay untouchable.
          promotedDragTarget =
            candidateId != null && candidateLayer && !candidateLayer.locked
              ? { id: candidateId, object: candidate }
              : null;
          return;
        }
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
      pointerDownPosRef.current = {
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      };
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
            return;
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
            return;
          }
        }
      }
      if (!event.target) {
        // Keynote: clicking any blank area exits group editing and
        // deselects everything. Clear hover state immediately: there is no
        // mousemove coming to do it.
        if (drillGroupIdRef.current) {
          onDrillExitRef.current?.();
        }
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);
        onSelectedLayerIdsChange([]);
        return;
      }
      // Drill-in: a click outside the drilled group exits drill-in and
      // selects the clicked layer. Dimmed objects are not selectable, so
      // the selection is applied manually here.
      const drillId = drillGroupIdRef.current;
      if (drillId) {
        let mapped: FabricObject | undefined =
          event.target.parent instanceof FabricShapeTextObject
            ? event.target.parent
            : event.target;
        while (mapped && !objectToLayerIdRef.current.has(mapped)) {
          mapped = mapped.parent;
        }
        const targetId = mapped
          ? objectToLayerIdRef.current.get(mapped)
          : undefined;
        if (
          targetId &&
          !isLayerInDrillScope(sceneRef.current.layers, drillId, targetId)
        ) {
          onSelectedLayerIdsChange([targetId]);
          return;
        }
      }
      if (promotedDragTarget) {
        const { id, object } = promotedDragTarget;
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
      hoveredObjectRef.current = null;
      magicMoveDraftRef.current = null;
      magicMoveDragRef.current = null;
      if (magicMoveRestoreTimerRef.current !== null) {
        clearTimeout(magicMoveRestoreTimerRef.current);
        magicMoveRestoreTimerRef.current = null;
      }
      onHoveredLayerIdChange(null);
      canvas.upperCanvasEl.removeEventListener("contextmenu", handleContextMenu, true);
      void canvas.dispose();
      fabricCanvasRef.current = null;
      objectToLayerId.clear();
      layerIdToObject.clear();
    };
  }, [
    addFabricObject,
    displayScale,
    onSelectedLayerIdsChange,
    onHoveredLayerIdChange,
    projectHeight,
    projectWidth,
    scene.id,
    syncDrillBoundary,
    syncObjectsToScene,
  ]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;

    if (!canvas) {
      return;
    }

    const scale = displayScale * zoom;
    const cursor = zoomCursorRef?.current;
    const canvasElement = canvasElementRef.current;
    const rectBefore =
      cursor && canvasElement ? canvasElement.getBoundingClientRect() : null;

    canvas.setDimensions({
      width: projectWidth * scale,
      height: projectHeight * scale,
    });

    let panX = 0;
    let panY = 0;

    // Zoom toward the cursor: keep the scene point under the pointer fixed.
    if (cursor && canvasElement && rectBefore) {
      const currentScale = canvas.viewportTransform[0];
      const currentPanX = canvas.viewportTransform[4];
      const currentPanY = canvas.viewportTransform[5];
      const sceneX = (cursor.x - rectBefore.left - currentPanX) / currentScale;
      const sceneY = (cursor.y - rectBefore.top - currentPanY) / currentScale;
      const rectAfter = canvasElement.getBoundingClientRect();
      panX = cursor.x - rectAfter.left - sceneX * scale;
      panY = cursor.y - rectAfter.top - sceneY * scale;
    }

    canvas.setViewportTransform([scale, 0, 0, scale, panX, panY]);
    setViewportTransform({ scale, panX, panY });
    canvas.requestRenderAll();
  }, [
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
      if (hoveredObjectRef.current === object) {
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);
      }
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
      canvas.backgroundColor = scene.backgroundColor ?? "#000000";

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
        if (drillFrameRef.current && drillFrameRef.current === object) {
          return false;
        }
        const layerId = objectToLayerId.get(object);
        return layerId === undefined || !topLevelIds.has(layerId);
      });

      // Drill-in presentation for one top-level entry. The drilled group
      // keeps its FabricGroup: its own frame becomes non-interactive while
      // the drill frame traces the children's union, and children stay
      // directly interactive through the group's interactive sub-targets.
      const applyDrillPresentation = (
        entry: DrillEntry,
        object: FabricObject,
      ): void => {
        const { layer } = entry;
        if (entry.dimmed) {
          // Outside the drilled group: de-emphasized and non-interactive.
          // `evented` stays as-is so a click outside still exits drill-in.
          const baseOpacity = layer.opacityEnabled ? layer.opacity : 1;
          object.set({
            opacity: baseOpacity * DRILL_DIM_FACTOR,
            selectable: false,
          });
          return;
        }
        if (
          entry.drilled &&
          layer.type === "group" &&
          object instanceof FabricGroup
        ) {
          object.set({
            selectable: false,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            hoverCursor: "default",
          });
          return;
        }
        if (layer.type === "group" && object instanceof FabricGroup) {
          // Restore the interactive frame once drill-in ends
          // (applyLayerToFabricObject does not touch these flags).
          object.set({
            hasControls: true,
            lockMovementX: false,
            lockMovementY: false,
            hoverCursor: layer.locked ? "default" : "pointer",
          });
        }
      };

      if (hasStructuralMismatch) {
        for (const object of [...canvas.getObjects()]) {
          canvas.remove(object);
        }
        // The removal above also drops the drill frame objects; clear the
        // ref so syncDrillBoundary recreates them instead of reusing the
        // detached ones.
        drillFrameRef.current = null;
        objectToLayerId.clear();
        layerIdToObject.clear();
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);

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

        if (entry.dimmed) {
          // Outside the drilled group: de-emphasized and non-interactive.
          // `evented` stays as-is so a click outside still exits drill-in.
          const baseOpacity = layer.opacityEnabled ? layer.opacity : 1;
          object.set({
            opacity: baseOpacity * DRILL_DIM_FACTOR,
            selectable: false,
          });
        } else {
          applyDrillPresentation(entry, object);
        }

        canvas.moveObjectTo(object, index);
      });

      // Hug the drilled group's children with the drill frame (or remove the
      // frame when drill-in ends).
      syncDrillBoundary(canvas);

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
  }, [addFabricObject, drillGroupId, onHoveredLayerIdChange, scene, selectedLayerIds, syncDrillBoundary]);

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
  const canvasWidth = projectWidth * displayScale * zoom;
  const canvasHeight = projectHeight * displayScale * zoom;
  const toViewport = (point: { x: number; y: number }) => ({
    x: point.x * viewportTransform.scale + viewportTransform.panX,
    y: point.y * viewportTransform.scale + viewportTransform.panY,
  });
  const viewportPath = magicMovePath
    ? {
        start: toViewport(magicMovePath.start),
        end: toViewport(magicMovePath.end),
      }
    : null;

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
      const canvas = fabricCanvasRef.current;
      if (canvas) {
        canvas.upperCanvasEl.style.pointerEvents = "";
        canvas._currentTransform = null;
        canvas.selection = true;
        canvas.skipTargetFind = false;
        applySelectionToCanvas(
          canvas,
          selectedLayerIdsRef.current,
          layerIdToObjectRef.current,
        );
        canvas.requestRenderAll();
      }
      isApplyingSelectionRef.current = false;
      magicMoveRestoreTimerRef.current = null;
    }, 100);
  }

  return (
    <div
      style={{
        position: "relative",
        width: canvasWidth,
        height: canvasHeight,
        overflow: "hidden",
        background: scene.backgroundColor ?? "#000000",
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
            onPointerDown={(event) => {
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
              magicMoveDragRef.current = {
                pointerId: event.pointerId,
                layerId: magicMoveContext.layer.id,
                animationId: magicMoveContext.animation.id,
              };
            }}
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
