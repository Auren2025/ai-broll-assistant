import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const DEFAULT_TIMELINE_HEIGHT = 224;
export const MIN_TIMELINE_HEIGHT = 120;
const MIN_CANVAS_HEIGHT = 240;

function clampHeight(value: number, maximumHeight: number): number {
  return Math.min(Math.max(value, MIN_TIMELINE_HEIGHT), maximumHeight);
}

export function useTimelineResize() {
  const [height, setHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    maximumHeight: number;
  } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    const workspace = event.currentTarget.closest<HTMLElement>(".canvas-workspace");
    if (!workspace) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
      maximumHeight: Math.max(MIN_TIMELINE_HEIGHT, workspace.clientHeight - MIN_CANVAS_HEIGHT - 7),
    };
    setIsResizing(true);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>): void {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setHeight(clampHeight(resize.startHeight - (event.clientY - resize.startY), resize.maximumHeight));
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>): void {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setIsResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const workspace = event.currentTarget.closest<HTMLElement>(".canvas-workspace");
    if (!workspace) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const maximumHeight = Math.max(MIN_TIMELINE_HEIGHT, workspace.clientHeight - MIN_CANVAS_HEIGHT - 7);
    setHeight((current) => clampHeight(current + direction * step, maximumHeight));
  }

  return {
    height, isResizing, onPointerDown, onPointerMove, onPointerEnd, onKeyDown,
    reset: () => setHeight(DEFAULT_TIMELINE_HEIGHT),
  };
}
