import type { Canvas } from "fabric";

/**
 * Pasteboard (画布外工作区): the editor canvas element is larger than the
 * finished project frame by MARGIN scene units on every side, so layers can
 * be parked, selected, and dragged outside the project without touching
 * Scene data: Scene (0,0) stays the project's top-left corner and the margin
 * is folded into the viewport pan, never persisted.
 *
 * The pasteboard is one continuous field, Keynote-style: the scroll area
 * behind the canvas element paints the same base color, so the gray extends
 * beyond the element bounds with no visible edge and no dimming. The project
 * frame reads as a card via its drop shadow plus a hairline edge.
 */

export const PASTEBOARD_MARGIN_MIN = 160;
export const PASTEBOARD_MARGIN_MAX = 400;

/**
 * Base color of the pasteboard. Must match the .canvas-editor-area
 * background in App.css so the gray continues past the element bounds.
 */
export const PASTEBOARD_BASE = "#d8d9de";
/** Hairline around the finished project frame. */
export const PROJECT_FRAME_EDGE = "rgba(15, 17, 22, 0.22)";
/** Soft drop shadow under the project frame (Keynote-like card). */
const PROJECT_FRAME_SHADOW = "rgba(15, 17, 22, 0.30)";

/**
 * Pasteboard margin in scene units: a third of the shorter project side,
 * clamped so DPR x Fabric's double canvas backing store stays reasonable.
 */
export function pasteboardMargin(
  projectWidth: number,
  projectHeight: number,
): number {
  const raw = Math.round(Math.min(projectWidth, projectHeight) / 3);
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
