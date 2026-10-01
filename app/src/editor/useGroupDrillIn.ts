import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import {
  Canvas,
  FabricObject,
  Group as FabricGroup,
  Point,
  Rect,
} from "fabric";
import type { Layer, Scene } from "../domain/sceneSchema";
import {
  DRILL_DIM_FACTOR,
  isLayerInDrillScope,
  type DrillEntry,
} from "./drillEntries";
import {
  findLayerByIdOrChild,
  findParentGroupLayer,
} from "./fabricLayerLookup";
import { FabricShapeTextObject } from "./fabricObjects";
import { findTopmostDrillChildAtPoint } from "./drillChildHitTest";

/** A press that moved more than this is a drag, not a click (scene units). */
const DRAG_VS_CLICK_PX = 5;

/** The subset of a fabric pointer event the drill-in handling reads. */
export interface DrillPointerEvent {
  target?: FabricObject | null;
  subTargets?: FabricObject[];
  scenePoint: Point;
}

export interface ResolvedDblClickTarget {
  mappedObject: FabricObject;
  childId: string;
  child: Layer;
}

export interface DrillDragTarget {
  id: string;
  object: FabricObject;
}

interface UseGroupDrillInOptions {
  drillGroupId: string | null;
  layerIdToObjectRef: RefObject<Map<string, FabricObject>>;
  objectToLayerIdRef: RefObject<Map<FabricObject, string>>;
  sceneRef: RefObject<Scene>;
  selectedLayerIdsRef: RefObject<readonly string[]>;
  onGroupEditEnter?: (groupId: string) => void;
  onDrillExit?: () => void;
  onSelectedLayerIdsChange: (layerIds: string[]) => void;
}

export interface GroupDrillInApi {
  /** Mirrored drill group id for long-lived canvas handlers. */
  drillGroupIdRef: RefObject<string | null>;
  /**
   * Keep the drill frame in sync with the drilled group (Keynote): a plain
   * white border tracing the group frame while drilling, removed when
   * drill-in ends.
   */
  syncDrillBoundary: (canvas: Canvas) => void;
  /** Show/hide the drill frame without recomputing it. */
  setDrillFrameVisible: (canvas: Canvas, visible: boolean) => void;
  /**
   * Repaint the drill frame bright after the pasteboard dim (after:render):
   * the frame is a plain canvas object, so the dim covers it when the
   * group straddles the project edge.
   */
  repaintDrillFrame: (canvas: Canvas, ctx: CanvasRenderingContext2D) => void;
  /** True while a drill-in session is active. */
  isDrilling: () => boolean;
  /** Hide the drill frame while a child is being transformed. */
  onDrillGestureTransform: (canvas: Canvas) => void;
  /** Re-show the drill frame, fitted, once a gesture completes. */
  onDrillGestureEnd: (canvas: Canvas) => void;
  /**
   * Drill-in presentation for one top-level scene-sync entry: dimmed
   * layers outside the drilled group become non-interactive, the drilled
   * group's own frame becomes non-interactive while children stay
   * editable through the group's sub-targets.
   */
  applyDrillPresentation: (entry: DrillEntry, object: FabricObject) => void;
  /** The drill frame is not a layer; never treat it as a structural change. */
  isDrillFrameObject: (object: FabricObject) => boolean;
  /** Drop the drill frame ref after a structural rebuild; it is recreated. */
  invalidateDrillFrame: () => void;
  /** Exit drill-in when active; no-op otherwise. */
  exitDrillIfActive: () => void;
  /**
   * mouse:down drill branch. Returns true when a click outside the drilled
   * group selected that layer (the event is consumed).
   */
  handleDrillOutsideClick: (event: DrillPointerEvent) => boolean;
  /**
   * mouse:dblclick drill entry via the selected group's frame. Returns true
   * when the event was consumed.
   */
  tryEnterDrillFromSelectedFrame: (
    event: DrillPointerEvent,
    canvas: Canvas,
  ) => boolean;
  /**
   * Resolve the double-clicked child for the drill-entry/text-edit fork.
   * Returns null when nothing actionable was hit.
   */
  resolveDblClickTarget: (
    event: DrillPointerEvent,
  ) => ResolvedDblClickTarget | null;
  /**
   * Drill entry via a double-clicked child group. Returns true when the
   * target is a group (the event is consumed either way: entering drill-in,
   * or a no-op when already drilling / after a drag).
   */
  tryEnterDrillForChild: (
    target: ResolvedDblClickTarget,
    canvas: Canvas,
  ) => boolean;
  /**
   * mouse:down:before drill branch. While drilling, a press on a child of
   * the drilled group drags the child itself: never promote the drag target
   * up to the group frame. When the topmost target is a dimmed outside
   * object but a drill child sits underneath the pointer, the child wins,
   * so overlapping outside objects can't steal the press. Returns the
   * child promotion target, null for an explicit no-promotion (locked
   * child), or undefined when not drilling / no child under the pointer.
   */
  resolveDrillDragTarget: (
    rawTarget: FabricObject,
    event: DrillPointerEvent,
    canvas: Canvas,
  ) => DrillDragTarget | null | undefined;
  /** Record a press for the drag-vs-double-click guard. */
  recordDrillPointerDown: (clientX: number, clientY: number) => void;
  /** Record a release for the drag-vs-double-click guard. */
  recordDrillPointerUp: (pointerEvent: MouseEvent | undefined) => void;
}

/**
 * Owns the canvas-side group drill-in (Keynote): entering via double-click,
 * exiting via blank click / Escape / selection, the white drill frame, the
 * dimming of outside layers, and the drag-vs-double-click guard. The
 * React-level drill state (which group id) lives in App; this hook owns
 * everything that touches the fabric canvas. All returned callbacks are
 * referentially stable.
 */
export function useGroupDrillIn(
  options: UseGroupDrillInOptions,
): GroupDrillInApi {
  const {
    drillGroupId,
    layerIdToObjectRef,
    objectToLayerIdRef,
    sceneRef,
    selectedLayerIdsRef,
    onGroupEditEnter,
    onDrillExit,
    onSelectedLayerIdsChange,
  } = options;

  // The drill frame overlay, the mirrored drill id / callbacks (so the
  // long-lived canvas handlers never close over stale values), and the
  // drag-vs-double-click guard state.
  const drillFrameRef = useRef<Rect | null>(null);
  const drillGroupIdRef = useRef<string | null>(drillGroupId);
  const groupEditEnterRef = useRef(onGroupEditEnter);
  const onDrillExitRef = useRef(onDrillExit);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const recentPointerUpsRef = useRef<{ dragged: boolean }[]>([]);

  useEffect(() => {
    drillGroupIdRef.current = drillGroupId;
  }, [drillGroupId]);

  useEffect(() => {
    groupEditEnterRef.current = onGroupEditEnter;
  }, [onGroupEditEnter]);

  useEffect(() => {
    onDrillExitRef.current = onDrillExit;
  }, [onDrillExit]);

  const isDrilling = useCallback((): boolean => {
    return drillGroupIdRef.current !== null;
  }, []);

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
  }, [layerIdToObjectRef]);

  const setDrillFrameVisible = useCallback(
    (canvas: Canvas, visible: boolean): void => {
      const frame = drillFrameRef.current;
      if (!frame) return;
      frame.set({ visible });
      canvas.requestRenderAll();
    },
    [],
  );

  const onDrillGestureTransform = useCallback(
    (canvas: Canvas): void => {
      // While drilling, the drill frame hides while a child is being
      // transformed (Keynote); it reappears fitted on gesture end.
      if (drillGroupIdRef.current) {
        setDrillFrameVisible(canvas, false);
      }
    },
    [setDrillFrameVisible],
  );

  const onDrillGestureEnd = useCallback(
    (canvas: Canvas): void => {
      // The gesture is done: re-show the drill frame, fitted to the
      // children's new frame.
      if (drillGroupIdRef.current) {
        syncDrillBoundary(canvas);
      }
    },
    [syncDrillBoundary],
  );

  const applyDrillPresentation = useCallback(
    (entry: DrillEntry, object: FabricObject): void => {
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
    },
    [],
  );

  const isDrillFrameObject = useCallback((object: FabricObject): boolean => {
    return drillFrameRef.current !== null && drillFrameRef.current === object;
  }, []);

  const invalidateDrillFrame = useCallback((): void => {
    drillFrameRef.current = null;
  }, []);

  const exitDrillIfActive = useCallback((): void => {
    if (drillGroupIdRef.current) {
      onDrillExitRef.current?.();
    }
  }, []);

  const handleDrillOutsideClick = useCallback(
    (event: DrillPointerEvent): boolean => {
      // Drill-in: a click outside the drilled group exits drill-in and
      // selects the clicked layer. Dimmed objects are not selectable, so
      // the selection is applied manually here.
      const drillId = drillGroupIdRef.current;
      if (!drillId) return false;
      const rawTarget = event.target;
      if (!rawTarget) return false;
      const mapped: FabricObject | undefined =
        rawTarget.parent instanceof FabricShapeTextObject
          ? rawTarget.parent
          : rawTarget;
      let current: FabricObject | undefined = mapped;
      while (current && !objectToLayerIdRef.current.has(current)) {
        current = current.parent;
      }
      const targetId = current
        ? objectToLayerIdRef.current.get(current)
        : undefined;
      if (
        targetId &&
        !isLayerInDrillScope(sceneRef.current.layers, drillId, targetId)
      ) {
        onSelectedLayerIdsChange([targetId]);
        return true;
      }
      return false;
    },
    [objectToLayerIdRef, sceneRef, onSelectedLayerIdsChange],
  );

  const recordDrillPointerDown = useCallback(
    (clientX: number, clientY: number): void => {
      pointerDownPosRef.current = { x: clientX, y: clientY };
    },
    [],
  );

  const recordDrillPointerUp = useCallback(
    (pointerEvent: MouseEvent | undefined): void => {
      // Record whether this press was a drag: a drag-then-click still fires
      // `dblclick` in the browser, but must not enter group drill-in.
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
    },
    [],
  );

  const isDragThenClickDblClick = useCallback((): boolean => {
    // A drag-then-click (or click-then-drag) still fires `dblclick` in the
    // browser: Chrome synthesizes a click on mouseup when the press started
    // and ended on the same element, even after movement — e.g. a macOS
    // three-finger drag ending near its start point pairs with the earlier
    // tap's click. At dblclick time the last two pointer-ups are the pair:
    // if either press was a drag, this is not a true double-click and must
    // not enter group drill-in.
    const ups = recentPointerUpsRef.current;
    if (ups.length < 2) return false;
    return ups[ups.length - 2]?.dragged === true ||
      ups[ups.length - 1]?.dragged === true;
  }, []);

  const tryEnterDrillFromSelectedFrame = useCallback(
    (event: DrillPointerEvent, canvas: Canvas): boolean => {
      // Drill-in: the group frame stays on the canvas as a boundary
      // overlay while its children become directly editable. Nothing is
      // selected on entry; the overlay marks the drill scope. A
      // drag-then-click is not a true double-click: don't drill in.
      const selectedLayerId = selectedLayerIdsRef.current.length === 1
        ? selectedLayerIdsRef.current[0]
        : null;
      const selectedObject = selectedLayerId
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
        if (isDragThenClickDblClick()) return true;
        groupEditEnterRef.current?.(selectedLayer.id);
        onSelectedLayerIdsChange([]);
        canvas.requestRenderAll();
        return true;
      }
      return false;
    },
    [
      isDragThenClickDblClick,
      layerIdToObjectRef,
      sceneRef,
      selectedLayerIdsRef,
      onSelectedLayerIdsChange,
    ],
  );

  const resolveDblClickTarget = useCallback(
    (event: DrillPointerEvent): ResolvedDblClickTarget | null => {
      const selectedLayerId = selectedLayerIdsRef.current.length === 1
        ? selectedLayerIdsRef.current[0]
        : null;
      const selectedObject = selectedLayerId
        ? layerIdToObjectRef.current.get(selectedLayerId)
        : undefined;
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
      if (!childObject) return null;
      let mappedObject: FabricObject | undefined = childObject;
      while (mappedObject && !objectToLayerIdRef.current.has(mappedObject)) {
        mappedObject = mappedObject.parent;
      }
      if (!mappedObject) return null;
      const childId = objectToLayerIdRef.current.get(mappedObject);
      const child = childId
        ? findLayerByIdOrChild(sceneRef.current, childId)
        : null;
      if (!childId || !child || child.locked) return null;
      return { mappedObject, childId, child };
    },
    [layerIdToObjectRef, objectToLayerIdRef, sceneRef, selectedLayerIdsRef],
  );

  const tryEnterDrillForChild = useCallback(
    (target: ResolvedDblClickTarget, canvas: Canvas): boolean => {
      const { mappedObject, childId, child } = target;
      if (child.type !== "group") return false;
      // Already drilling this group: double-clicking its empty area is a
      // no-op (the drill frame already marks the drill scope).
      if (drillGroupIdRef.current === child.id) return true;
      // A drag-then-click is not a true double-click: don't drill in.
      if (isDragThenClickDblClick()) return true;
      canvas.setActiveObject(mappedObject);
      onSelectedLayerIdsChange([childId]);
      groupEditEnterRef.current?.(child.id);
      canvas.requestRenderAll();
      return true;
    },
    [isDragThenClickDblClick, onSelectedLayerIdsChange],
  );

  const resolveDrillChildTarget = useCallback(
    (
      start: FabricObject,
    ): DrillDragTarget | null | undefined => {
      const drillId = drillGroupIdRef.current;
      if (!drillId) return undefined;
      let candidate: FabricObject | undefined =
        start.parent instanceof FabricShapeTextObject
          ? start.parent
          : start;
      while (candidate && !objectToLayerIdRef.current.has(candidate)) {
        candidate = candidate.parent instanceof FabricObject
          ? candidate.parent
          : undefined;
      }
      const candidateId = candidate
        ? objectToLayerIdRef.current.get(candidate)
        : undefined;
      const candidateLayer = candidateId != null
        ? findLayerByIdOrChild(sceneRef.current, candidateId)
        : null;
      const parentGroup = candidateId != null
        ? findParentGroupLayer(sceneRef.current, candidateId)
        : null;
      if (candidate && parentGroup && parentGroup.id === drillId) {
        // Select the child immediately and drag it, mirroring the
        // promotion path below but without promoting to the group frame.
        // Locked children stay untouchable.
        return candidateId != null && candidateLayer && !candidateLayer.locked
          ? { id: candidateId, object: candidate }
          : null;
      }
      return undefined;
    },
    [objectToLayerIdRef, sceneRef],
  );

  const resolveDrillDragTarget = useCallback(
    (
      rawTarget: FabricObject,
      event: DrillPointerEvent,
      canvas: Canvas,
    ): DrillDragTarget | null | undefined => {
      const drillId = drillGroupIdRef.current;
      if (!drillId) return undefined;
      const direct = resolveDrillChildTarget(rawTarget);
      if (direct !== undefined) return direct;
      // A dimmed outside object with higher z-order wins Fabric's topmost
      // hit test, but a press that also lands on a drill child belongs to
      // the child: only a press with no child underneath exits drill-in.
      const group = canvas
        .getObjects()
        .find(
          (object): object is FabricGroup =>
            object instanceof FabricGroup &&
            objectToLayerIdRef.current.get(object) === drillId,
        );
      if (!group) return undefined;
      const hit = findTopmostDrillChildAtPoint(
        group.getObjects(),
        event.scenePoint,
      );
      if (hit) return resolveDrillChildTarget(hit);
      return undefined;
    },
    [objectToLayerIdRef, resolveDrillChildTarget],
  );

  const repaintDrillFrame = useCallback(
    (canvas: Canvas, ctx: CanvasRenderingContext2D): void => {
      // The pasteboard dim (after:render) covers the drill frame when the
      // group straddles the project edge; repaint it bright so the drill
      // scope marker never dims with the element. The frame is a plain
      // canvas object, so render it under the current viewport transform,
      // mirroring the main render pass.
      const frame = drillFrameRef.current;
      if (!frame || !frame.visible) return;
      const vpt = canvas.viewportTransform;
      ctx.save();
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
      frame.render(ctx);
      ctx.restore();
    },
    [],
  );

  return {
    drillGroupIdRef,
    syncDrillBoundary,
    setDrillFrameVisible,
    repaintDrillFrame,
    isDrilling,
    onDrillGestureTransform,
    onDrillGestureEnd,
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
  };
}
