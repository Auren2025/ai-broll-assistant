import { useEffect, useRef, useState, type RefObject } from "react";

export const BASE_CANVAS_SCALE = 0.5;
export const ZOOM_STEP = 0.25;
export const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 6;

function clampCanvasZoom(value: number): number {
  return Math.min(Math.max(value, MIN_CANVAS_ZOOM), MAX_CANVAS_ZOOM);
}

/**
 * Where a pinch zoom should anchor. The rect must be captured at the wheel
 * event, before React re-renders: the canvas wrapper is flex-centered, so
 * resizing it for the new zoom also moves its left/top. Measuring the rect
 * after the re-render (inside the zoom effect) pairs the new layout with
 * the old viewport transform and the content drifts on every pinch tick.
 */
export interface CanvasZoomCursor {
  x: number;
  y: number;
  rectLeft: number;
  rectTop: number;
}

export function useCanvasZoom(
  areaRef: RefObject<HTMLDivElement | null>,
  canvasElementRef: RefObject<HTMLCanvasElement | null>,
  isPreviewMode: boolean,
  hasScene: boolean,
) {
  const [zoom, setZoom] = useState(1);
  const cursorRef = useRef<CanvasZoomCursor | null>(null);
  const isPreviewModeRef = useRef(isPreviewMode);
  useEffect(() => {
    isPreviewModeRef.current = isPreviewMode;
  }, [isPreviewMode]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || isPreviewModeRef.current) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16
        : event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY;
      const canvasElement = canvasElementRef.current;
      const rect = canvasElement?.getBoundingClientRect();
      cursorRef.current = rect
        ? {
            x: event.clientX,
            y: event.clientY,
            rectLeft: rect.left,
            rectTop: rect.top,
          }
        : null;
      setZoom((current) => clampCanvasZoom(current * Math.exp(-delta / 150)));
    };
    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => area.removeEventListener("wheel", handleWheel);
  }, [areaRef, canvasElementRef, hasScene, isPreviewMode]);

  return {
    zoom,
    cursorRef,
    zoomBy(delta: number) {
      // Anchor button zoom to the canvas center (via the same cursor math
      // pinch uses) so content doesn't drift toward the top-left origin.
      const canvasElement = canvasElementRef.current;
      const rect = canvasElement?.getBoundingClientRect();
      cursorRef.current = rect
        ? {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            rectLeft: rect.left,
            rectTop: rect.top,
          }
        : null;
      setZoom((current) => clampCanvasZoom(current + delta));
    },
    resetZoom() {
      cursorRef.current = null;
      setZoom(1);
    },
  };
}
