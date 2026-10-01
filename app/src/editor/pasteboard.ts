import type { Canvas } from "fabric";

/**
 * Pasteboard (画布外工作区): the editor canvas element is larger than the
 * finished project frame by MARGIN scene units on every side, so layers can
 * be parked, selected, and dragged outside the project without touching
 * Scene data: Scene (0,0) stays the project's top-left corner and the margin
 * is folded into the viewport pan, never persisted.
 *
 * Keynote-style: the whole surround is one continuous dark gray field.
 * The canvas element paints PASTEBOARD_BASE (lighter), then a translucent
 * dim over everything outside the project frame — this dims both the base
 * and any off-project objects. The scroll area behind the element paints
 * PASTEBOARD_DARK (the base+dim composite) flat, so the dark field continues
 * past the element bounds with no visible edge. The project frame reads as
 * a card via its drop shadow plus a hairline edge.
 *
 * Margins are derived from the real scroll-area size: at minimum zoom the
 * element fills the visible area exactly (minus the stage padding), so the
 * whole gray field is interactive — no dead bands, no scrollbars, and the
 * project sits perfectly centered. Margins only ever grow within a session
 * (monotonic): a smaller window never shrinks the element, so layers parked
 * far out can never get stranded outside the interactive area.
 */

export const PASTEBOARD_MARGIN_MIN = 400;
/** Total stage padding (20px each side) around the canvas element. */
export const PASTEBOARD_STAGE_PADDING = 40;

/**
 * Base color painted on the canvas element before the dim (editor only).
 * Deliberately lighter than the final dark gray: the dim below darkens it
 * to PASTEBOARD_DARK.
 */
export const PASTEBOARD_BASE = "#d8d9de";
/** Translucent dim painted over the pasteboard (editor only). */
export const PASTEBOARD_DIM = "rgba(23, 25, 31, 0.36)";
/**
 * Final dark gray of the whole pasteboard field = PASTEBOARD_BASE +
 * PASTEBOARD_DIM composite. The `.canvas-editor-area` scroll container paints
 * this flat so the dark gray continues past the element bounds seamlessly.
 */
export const PASTEBOARD_DARK = "#939499";
/** Hairline around the finished project frame. */
export const PROJECT_FRAME_EDGE = "rgba(15, 17, 22, 0.22)";
/** Soft drop shadow under the project frame (Keynote-like card). */
const PROJECT_FRAME_SHADOW = "rgba(15, 17, 22, 0.30)";

/**
 * Interactive margin around the finished project, per axis, in scene units.
 */
export interface PasteboardMargins {
  x: number;
  y: number;
}

/**
 * Margins that make the element fill the scroll area exactly at minimum
 * zoom. minScale is the smallest element scale the UI allows
 * (BASE_CANVAS_SCALE * MIN_CANVAS_ZOOM): margins are solved so that
 * (project + 2 * margin) * minScale = area size - stage padding.
 */
export function marginsForViewport(args: {
  areaWidth: number;
  areaHeight: number;
  minScale: number;
  projectWidth: number;
  projectHeight: number;
}): PasteboardMargins {
  const fitWidth = (args.areaWidth - PASTEBOARD_STAGE_PADDING) / args.minScale;
  const fitHeight =
    (args.areaHeight - PASTEBOARD_STAGE_PADDING) / args.minScale;
  return {
    x: Math.max(
      PASTEBOARD_MARGIN_MIN,
      Math.round((fitWidth - args.projectWidth) / 2),
    ),
    y: Math.max(
      PASTEBOARD_MARGIN_MIN,
      Math.round((fitHeight - args.projectHeight) / 2),
    ),
  };
}

/** Element size (project + margin on every side), in scene units. */
export function pasteboardElementSize(
  projectWidth: number,
  projectHeight: number,
  margins: PasteboardMargins,
): { width: number; height: number } {
  return {
    width: projectWidth + margins.x * 2,
    height: projectHeight + margins.y * 2,
  };
}

export interface ViewportState {
  scale: number;
  panX: number;
  panY: number;
}

/**
 * Origin-anchored viewport: the project frame's top-left sits at
 * (margins.x * scale, margins.y * scale) inside the enlarged element.
 * panX/panY are the full viewport translation (margin folded in), so
 * existing scene<->element math keeps working unchanged.
 */
export function canonicalViewport(
  scale: number,
  margins: PasteboardMargins,
): ViewportState {
  return { scale, panX: margins.x * scale, panY: margins.y * scale };
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
  margins: PasteboardMargins;
  cursor: ZoomCursor | null;
  rectAfter: { left: number; top: number } | null;
}): ViewportState {
  const { prev, scale, margins, cursor, rectAfter } = args;
  if (!cursor || !rectAfter) {
    return canonicalViewport(scale, margins);
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
 * Paints the editor backdrop under everything (before:render): the
 * pasteboard base over the whole element, then the project frame as a
 * card (drop shadow + scene background + hairline edge). Editor-only:
 * preview and export render from Scene data and never see this.
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
  // Project card: a soft shadow so the frame reads on the uniform gray,
  // then the scene background. Painted here (before the objects) so
  // off-project layers sit above the shadow, Keynote-style.
  ctx.shadowColor = PROJECT_FRAME_SHADOW;
  ctx.shadowBlur = 28;
  ctx.fillStyle = args.backgroundColor;
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = PROJECT_FRAME_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1);
  ctx.restore();
}

/**
 * The four rectangles around the project frame, in element pixels. Used by
 * paintPasteboardDim; pure so it can be unit-tested.
 */
export function pasteboardDimRects(
  elementWidth: number,
  elementHeight: number,
  frame: PixelRect,
): PixelRect[] {
  return [
    // top band
    { x: 0, y: 0, width: elementWidth, height: frame.y },
    // bottom band
    {
      x: 0,
      y: frame.y + frame.height,
      width: elementWidth,
      height: elementHeight - frame.y - frame.height,
    },
    // left strip
    { x: 0, y: frame.y, width: frame.x, height: frame.height },
    // right strip
    {
      x: frame.x + frame.width,
      y: frame.y,
      width: elementWidth - frame.x - frame.width,
      height: frame.height,
    },
  ];
}

/**
 * Dims the pasteboard after Fabric renders the objects (after:render), so
 * layers parked outside the project frame — including ones crossing the
 * frame edge — read as dimmed, Keynote-style. The project frame itself is
 * never dimmed. Editor-only: preview and export render from Scene data.
 *
 * Selection controls and the drill-in frame are painted above the dim and
 * re-brightened afterwards, so they stay fully visible.
 */
export function paintPasteboardDim(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
  args: { projectWidth: number; projectHeight: number },
): void {
  const vpt = canvas.viewportTransform;
  const frame = projectFrameRect({
    scale: vpt[0],
    panX: vpt[4],
    panY: vpt[5],
    projectWidth: args.projectWidth,
    projectHeight: args.projectHeight,
  });
  const rects = pasteboardDimRects(
    canvas.getWidth(),
    canvas.getHeight(),
    frame,
  );
  ctx.save();
  ctx.fillStyle = PASTEBOARD_DIM;
  for (const r of rects) {
    if (r.width > 0 && r.height > 0) ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  ctx.restore();
}
