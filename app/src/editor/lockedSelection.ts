import { ActiveSelection, Point } from "fabric";
import type { Canvas, FabricObject } from "fabric";
import { isFabricObjectLocked } from "./fabricAdapter.ts";

/** Keynote-style locked selection gray. */
export const LOCKED_BORDER_COLOR = "#8e8e93";

const X_HALF_SIZE = 4; // screen px, half the X mark's extent
const X_LINE_WIDTH = 1.5;

/**
 * Screen-space corners of the object's bounding box. getCoords() is in the
 * scene plane; the viewport transform is applied manually so the marks
 * stay a constant screen size regardless of zoom.
 */
function screenCorners(canvas: Canvas, object: FabricObject): Point[] {
  const vpt = canvas.viewportTransform;
  return object.getCoords().map(
    (p) =>
      new Point(
        p.x * vpt[0] + p.y * vpt[2] + vpt[4],
        p.x * vpt[1] + p.y * vpt[3] + vpt[5],
      ),
  );
}

/**
 * Keynote-style locked handles: X marks at the 4 corners and 4 edge
 * midpoints, drawn in screen space.
 */
export function paintLockedXHandles(
  ctx: CanvasRenderingContext2D,
  canvas: Canvas,
  object: FabricObject,
): void {
  const [tl, tr, br, bl] = screenCorners(canvas, object);
  const mid = (a: Point, b: Point) =>
    new Point((a.x + b.x) / 2, (a.y + b.y) / 2);
  const spots = [
    tl,
    tr,
    br,
    bl,
    mid(tl, tr),
    mid(tr, br),
    mid(br, bl),
    mid(bl, tl),
  ];
  ctx.save();
  ctx.strokeStyle = LOCKED_BORDER_COLOR;
  ctx.lineWidth = X_LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const s of spots) {
    ctx.moveTo(s.x - X_HALF_SIZE, s.y - X_HALF_SIZE);
    ctx.lineTo(s.x + X_HALF_SIZE, s.y + X_HALF_SIZE);
    ctx.moveTo(s.x + X_HALF_SIZE, s.y - X_HALF_SIZE);
    ctx.lineTo(s.x - X_HALF_SIZE, s.y + X_HALF_SIZE);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Gray border for a locked object, drawn with Fabric's own border
 * machinery so it matches the blue selection border exactly — just
 * without Fabric's square handles (the X marks are painted separately).
 */
export function paintLockedBorder(
  ctx: CanvasRenderingContext2D,
  object: FabricObject,
): void {
  object._renderControls(ctx, {
    borderColor: LOCKED_BORDER_COLOR,
    hasBorders: true,
    hasControls: false,
  });
}

/**
 * Single locked selection: gray border + X handles. Called from
 * after:render after the pasteboard dim, so the chrome stays bright.
 * Locked members of a multi-select are handled in paintMultiSelectBorders.
 */
export function paintLockedSelection(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
): void {
  const active = canvas.getActiveObject();
  if (!active || active instanceof ActiveSelection) return;
  if (!active.visible || !isFabricObjectLocked(active)) return;
  paintLockedBorder(ctx, active);
  paintLockedXHandles(ctx, canvas, active);
}
