import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { Canvas, FabricObject, Group as FabricGroup } from "fabric";

const HOVER_BORDER_COLOR = "#7147e8";

/**
 * Resolve a mouse target to its hover object: hovering a group child
 * highlights the whole group.
 */
export function resolveHoverTarget(
  target: FabricObject | null | undefined,
): FabricObject | null {
  if (!target) return null;
  const parent = target.parent;
  return parent instanceof FabricGroup ? parent : target;
}

interface UseCanvasHoverOptions {
  drillGroupId: string | null | undefined;
  drillGroupIdRef: RefObject<string | null>;
  fabricCanvasRef: RefObject<Canvas | null>;
  objectToLayerIdRef: RefObject<Map<FabricObject, string>>;
  onHoveredLayerIdChange: (layerId: string | null) => void;
}

export interface CanvasHoverApi {
  /** mouse:move tail: resolve the target, update state, notify React, repaint. */
  updateHover: (
    canvas: Canvas,
    target: FabricObject | null | undefined,
  ) => void;
  /** mouse:out: drop hover state. */
  clearHoverOnMouseOut: (canvas: Canvas) => void;
  /** after:render: paint the purple hover border with all its guards. */
  paintHoverBorder: (canvas: Canvas, ctx: CanvasRenderingContext2D) => void;
  /** Drop hover state (drill change, blank click, object resync). */
  clearHover: () => void;
  /** Drop hover state only when it currently points at `object` (removal). */
  clearHoverForObject: (object: FabricObject) => void;
}

/**
 * Owns the canvas hover state: which object the pointer is over, the React
 * notification, and the purple hover border painted in after:render.
 * Previously the hovered-object ref was written in the mouse handlers and
 * cleared in six different places across the canvas component; now there is
 * a single owner. All returned callbacks are referentially stable, so canvas
 * effects can list them as dependencies without re-running.
 */
export function useCanvasHover(
  options: UseCanvasHoverOptions,
): CanvasHoverApi {
  const {
    drillGroupId,
    drillGroupIdRef,
    fabricCanvasRef,
    objectToLayerIdRef,
    onHoveredLayerIdChange,
  } = options;
  const hoveredObjectRef = useRef<FabricObject | null>(null);
  const onHoveredLayerIdChangeRef = useRef(onHoveredLayerIdChange);
  useEffect(() => {
    onHoveredLayerIdChangeRef.current = onHoveredLayerIdChange;
  }, [onHoveredLayerIdChange]);

  const clearHover = useCallback((): void => {
    hoveredObjectRef.current = null;
    onHoveredLayerIdChangeRef.current(null);
  }, []);

  // Entering or exiting drill-in invalidates hover state: the purple hover
  // border would otherwise linger (e.g. blank-click exits drill without any
  // mousemove to clear it).
  useEffect(() => {
    if (drillGroupIdRef.current !== drillGroupId) {
      clearHover();
      fabricCanvasRef.current?.requestRenderAll();
    }
    drillGroupIdRef.current = drillGroupId ?? null;
  }, [drillGroupId, drillGroupIdRef, fabricCanvasRef, clearHover]);

  // Unmount: drop hover state.
  useEffect(() => {
    return () => {
      hoveredObjectRef.current = null;
      onHoveredLayerIdChangeRef.current(null);
    };
  }, []);

  const clearHoverForObject = useCallback(
    (object: FabricObject): void => {
      if (hoveredObjectRef.current === object) {
        clearHover();
      }
    },
    [clearHover],
  );

  const updateHover = useCallback(
    (canvas: Canvas, target: FabricObject | null | undefined): void => {
      const hoverTarget = resolveHoverTarget(target);
      if (hoverTarget === hoveredObjectRef.current) return;

      hoveredObjectRef.current = hoverTarget;
      onHoveredLayerIdChangeRef.current(
        hoverTarget
          ? (objectToLayerIdRef.current.get(hoverTarget) ?? null)
          : null,
      );
      canvas.requestRenderAll();
    },
    [objectToLayerIdRef],
  );

  const clearHoverOnMouseOut = useCallback(
    (canvas: Canvas): void => {
      if (!hoveredObjectRef.current) return;
      clearHover();
      canvas.requestRenderAll();
    },
    [clearHover],
  );

  const paintHoverBorder = useCallback(
    (canvas: Canvas, ctx: CanvasRenderingContext2D): void => {
      const hoveredObject = hoveredObjectRef.current;
      // During drill-in, hovering a child resolves to the drilled group;
      // never paint a hover border for the group being drilled.
      const hoveredLayerId = hoveredObject
        ? objectToLayerIdRef.current.get(hoveredObject)
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
        borderColor: HOVER_BORDER_COLOR,
        hasBorders: true,
        hasControls: false,
      });
    },
    [drillGroupIdRef, objectToLayerIdRef],
  );

  return {
    updateHover,
    clearHoverOnMouseOut,
    paintHoverBorder,
    clearHover,
    clearHoverForObject,
  };
}
