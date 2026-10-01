import { useEffect, useRef, useState, type RefObject } from "react";

export const BASE_CANVAS_SCALE = 0.5;
export const ZOOM_STEP = 0.25;
export const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 6;

function clampCanvasZoom(value: number): number {
  return Math.min(Math.max(value, MIN_CANVAS_ZOOM), MAX_CANVAS_ZOOM);
}

/**
 * Canvas zoom state. Zoom is always center-zoom: the project stays centered
 * in the visible area and zoom only changes its size, never its position.
 * There is intentionally no cursor anchoring — the cursor math was the
 * source of every zoom-drift bug, and the product decision is that the
 * black project frame is always centered.
 */
export function useCanvasZoom(
  areaRef: RefObject<HTMLDivElement | null>,
  isPreviewMode: boolean,
  hasScene: boolean,
) {
  const [zoom, setZoom] = useState(1);
  // Bumped on every Fit click, even when the zoom is already 1: resetting
  // the zoom alone is a state no-op in that case, but Fit must always
  // restore the standard centered view (recenter the scroll), never be a
  // silent no-op.
  const [fitSeq, setFitSeq] = useState(0);
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
      setZoom((current) => clampCanvasZoom(current * Math.exp(-delta / 150)));
    };
    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => area.removeEventListener("wheel", handleWheel);
  }, [areaRef, hasScene, isPreviewMode]);

  return {
    zoom,
    fitSeq,
    zoomBy(delta: number) {
      setZoom((current) => clampCanvasZoom(current + delta));
    },
    resetZoom() {
      setFitSeq((s) => s + 1);
      setZoom(1);
    },
  };
}
