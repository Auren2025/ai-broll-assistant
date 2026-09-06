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
} from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";
import { resolveDragTarget } from "./fabricTargetResolution";
import {
  applyLayerToFabricObject,
  applySelectionToCanvas,
  createFabricObjectForLayer,
  isFabricObjectForLayer,
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
import { computeTextBoxSize } from "./textMetrics";

registerFabricObjectClasses();
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
  selectedAnimationId,
  onMagicMoveTranslationCommit,
  pendingTextEditLayerId,
  onPendingTextEditConsumed,
  onTextLayerChange,
}: FabricSceneCanvasProps) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const layerIdToObjectRef = useRef<Map<string, FabricObject>>(new Map());
  const objectToLayerIdRef = useRef<Map<FabricObject, string>>(new Map());
  const hoveredObjectRef = useRef<FabricObject | null>(null);
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
  }, [scene.id, selectedAnimationId, selectedLayerIds]);

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
            return childChanged ? { ...nextGroup, children } : nextGroup;
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
    },
    [],
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
            canvas.requestRenderAll();
          } finally {
            isApplyingSelectionRef.current = false;
          }
        });
        return;
      }

      syncObjectsToScene([target]);
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
      if (
        !hoveredObject ||
        !hoveredObject.visible ||
        !canvas.getObjects().includes(hoveredObject) ||
        canvas.getActiveObjects().includes(hoveredObject)
      ) {
        return;
      }

      hoveredObject._renderControls(ctx, {
        borderColor: "#7147e8",
        hasBorders: true,
        hasControls: false,
      });
    });
    canvas.on("mouse:up", () => {
      lockedAxisRef.current = null;
      lockOriginRef.current = null;
    });
    canvas.on("mouse:dblclick", (event) => {
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
        canvas.setActiveObject(selectedObject);
        onSelectedLayerIdsChange([selectedLayer.id]);
        groupEditEnterRef.current?.(selectedLayer.id);
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
    canvas.on("mouse:down:before", (event) => {
      const rawTarget = event.target;
      if (!rawTarget) {
        promotedDragTarget = null;
        return;
      }

      const target = resolveDragTarget(
        rawTarget,
        selectedLayerIdsRef.current,
        (candidate) =>
          candidate.parent instanceof FabricShapeTextObject
            ? candidate.parent
            : candidate,
        (candidate) =>
          candidate.parent instanceof FabricObject
            ? candidate.parent
            : undefined,
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
      if (!event.target) {
        onSelectedLayerIdsChange([]);
        return;
      }
      if (promotedDragTarget) {
        const { id, object } = promotedDragTarget;
        canvas.setActiveObject(object);
        onSelectedLayerIdsChange([id]);
        canvas._currentTransform = null;
        canvas._setupCurrentTransform(pointerEvent, object, false);
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

      const sortedLayers = [...scene.layers].sort(
        (first, second) => first.zIndex - second.zIndex,
      );
      const topLevelIds = new Set(sortedLayers.map((layer) => layer.id));
      const desiredLayerIds = new Set<string>();
      for (const layer of sortedLayers) {
        desiredLayerIds.add(layer.id);
        if (layer.type === "group") {
          layer.children.forEach((child) => desiredLayerIds.add(child.id));
        }
      }

      const hasStructuralMismatch = canvas.getObjects().some((object) => {
        const layerId = objectToLayerId.get(object);
        return layerId === undefined || !topLevelIds.has(layerId);
      });

      if (hasStructuralMismatch) {
        for (const object of [...canvas.getObjects()]) {
          canvas.remove(object);
        }
        objectToLayerId.clear();
        layerIdToObject.clear();
        hoveredObjectRef.current = null;
        onHoveredLayerIdChange(null);

        sortedLayers.forEach((layer) => {
          addFabricObject(canvas, layer);
        });

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

      sortedLayers.forEach((layer, index) => {
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

        canvas.moveObjectTo(object, index);
      });

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
  }, [addFabricObject, onHoveredLayerIdChange, scene, selectedLayerIds]);

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
