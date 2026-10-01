import type { Canvas } from "fabric";

/**
 * Pasteboard (画布外工作区): the editor canvas element is larger than the
 * finished project frame by MARGIN scene units on every side, so layers can
 * be parked, selected, and dragged outside the project without touching
 * Scene data: Scene (0,0) stays the project's top-left corner and the margin
 * is folded into the viewport pan, never persisted.
 */

export const PASTEBOARD_MARGIN_MIN = 120;
export const PASTEBOARD_MARGIN_MAX = 320;

/** Base color of the pasteboard (element area outside the project frame). */
export const PASTEBOARD_BASE = "#d8d9de";
/** Dim painted over the pasteboard in the editor only: marks "not exported". */
export const PASTEBOARD_DIM = "rgba(23, 25, 31, 0.36)";
/** Hairline around the finished project frame. */
export const PROJECT_FRAME_EDGE = "rgba(15, 17, 22, 0.22)";

/**
 * Pasteboard margin in scene units: a quarter of the shorter project side,
 * clamped so DPR x Fabric's double canvas backing store stays reasonable.
 */
export function pasteboardMargin(
  projectWidth: number,
  projectHeight: number,
): number {
  const raw = Math.round(Math.min(projectWidth, projectHeight) * 0.25);
  return Math.min(
    PASTEBOARD_MARGIN_MAX,
    Math.max(PASTEBOARD_MARGIN_MIN, raw),
  );
}

export interface ViewportState {
  scale: number;
  panX: number;
  panY: number;
}

/**
 * Origin-anchored viewport: the project frame's top-left sits at
 * (margin * scale) inside the enlarged element. panX/panY are the full
 * viewport translation (margin folded in), so existing scene<->element
 * math keeps working unchanged.
 */
export function canonicalViewport(
  scale: number,
  margin: number,
): ViewportState {
  return { scale, panX: margin * scale, panY: margin * scale };
}

export interface ZoomCursor {
  x: number;
  y: number;
  rectLeft: number;
  rectTop: number;
}

/**
 * Zoom math, extracted as a pure function so pinch/button zoom can be
 * unit-tested: without a cursor the viewport re-anchors to the canonical
 * margin-folded origin; with a cursor the scene point under the pointer
 * stays fixed across the scale change.
 */
export function zoomViewport(args: {
  prev: ViewportState;
  scale: number;
  margin: number;
  cursor: ZoomCursor | null;
  rectAfter: { left: number; top: number } | null;
}): ViewportState {
  const { prev, scale, margin, cursor, rectAfter } = args;
  if (!cursor || !rectAfter) {
    return canonicalViewport(scale, margin);
  }
  const sceneX = (cursor.x - cursor.rectLeft - prev.panX) / prev.scale;
  const sceneY = (cursor.y - cursor.rectTop - prev.panY) / prev.scale;
  return {
    scale,
    panX: cursor.x - rectAfter.left - sceneX * scale,
    panY: cursor.y - rectAfter.top - sceneY * scale,
  };
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Project frame rect in element pixels, derived from the viewport. */
export function projectFrameRect(args: {
  scale: number;
  panX: number;
  panY: number;
  projectWidth: number;
  projectHeight: number;
}): PixelRect {
  return {
    x: args.panX,
    y: args.panY,
    width: args.projectWidth * args.scale,
    height: args.projectHeight * args.scale,
  };
}

/**
 * The four dim regions surrounding the project frame, in element pixels,
 * clipped to the element bounds. Their union is exactly the pasteboard
 * (element area minus project frame); empty rects are dropped.
 */
export function pasteboardDimRects(args: {
  elementWidth: number;
  elementHeight: number;
  scale: number;
  panX: number;
  panY: number;
  projectWidth: number;
  projectHeight: number;
}): PixelRect[] {
  const { elementWidth, elementHeight } = args;
  const frame = projectFrameRect(args);
  const candidates: PixelRect[] = [
    // above
    { x: 0, y: 0, width: elementWidth, height: frame.y },
    // below
    {
      x: 0,
      y: frame.y + frame.height,
      width: elementWidth,
      height: elementHeight - (frame.y + frame.height),
    },
    // left
    { x: 0, y: frame.y, width: frame.x, height: frame.height },
    // right
    {
      x: frame.x + frame.width,
      y: frame.y,
      width: elementWidth - (frame.x + frame.width),
      height: frame.height,
    },
  ];
  return candidates.filter((rect) => rect.width > 0 && rect.height > 0);
}

/**
 * Paints the editor backdrop under everything (before:render): the
 * pasteboard base over the whole element, then the scene background over
 * the project frame. Editor-only: preview and export render from Scene
 * data and never see this.
 */
export function paintPasteboardBase(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  args: { projectWidth: number; projectHeight: number; backgroundColor: string },
): void {
  const vpt = canvas.viewportTransform;
  const frame = projectFrameRect({
    scale: vpt[0],
    panX: vpt[4],
    panY: vpt[5],
    projectWidth: args.projectWidth,
    projectHeight: args.projectHeight,
  });
  ctx.save();
  ctx.fillStyle = PASTEBOARD_BASE;
  ctx.fillRect(0, 0, canvas.getWidth(), canvas.getHeight());
  ctx.fillStyle = args.backgroundColor;
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.restore();
}

/**
 * Dims the pasteboard over the rendered objects (after:render, main context
 * only) and strokes the project frame edge. Selection chrome is repainted
 * after this call, so borders and handles stay full-bright.
 */
export function paintPasteboardDim(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  args: { projectWidth: number; projectHeight: number },
): void {
  const vpt = canvas.viewportTransform;
  const scale = vpt[0];
  const panX = vpt[4];
  const panY = vpt[5];
  const frame = projectFrameRect({
    scale,
    panX,
    panY,
    projectWidth: args.projectWidth,
    projectHeight: args.projectHeight,
  });
  const rects = pasteboardDimRects({
    elementWidth: canvas.getWidth(),
    elementHeight: canvas.getHeight(),
    scale,
    panX,
    panY,
    projectWidth: args.projectWidth,
    projectHeight: args.projectHeight,
  });
  ctx.save();
  ctx.fillStyle = PASTEBOARD_DIM;
  for (const rect of rects) {
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.strokeStyle = PROJECT_FRAME_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1);
  ctx.restore();
}
