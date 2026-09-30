import { useEffect, useRef, useState, type RefObject } from "react";

export const BASE_CANVAS_SCALE = 0.5;
export const ZOOM_STEP = 0.25;
const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 6;

function clampCanvasZoom(value: number): number {
  return Math.min(Math.max(value, MIN_CANVAS_ZOOM), MAX_CANVAS_ZOOM);
}

export function useCanvasZoom(
  areaRef: RefObject<HTMLDivElement | null>,
  isPreviewMode: boolean,
  hasScene: boolean,
) {
  const [zoom, setZoom] = useState(1);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
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
      cursorRef.current = { x: event.clientX, y: event.clientY };
      setZoom((current) => clampCanvasZoom(current * Math.exp(-delta / 150)));
    };
    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => area.removeEventListener("wheel", handleWheel);
  }, [areaRef, hasScene, isPreviewMode]);

  return {
    zoom,
    cursorRef,
    zoomBy(delta: number) {
      cursorRef.current = null;
      setZoom((current) => clampCanvasZoom(current + delta));
    },
    resetZoom() {
      cursorRef.current = null;
      setZoom(1);
    },
  };
}
