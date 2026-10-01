import { ActiveSelection } from "fabric";
import type { Canvas } from "fabric";

const MULTI_SELECT_BORDER_COLOR = "#0a84ff";

/**
 * Keynote-style multi-select visuals: no common outer frame. Each member
 * of the ActiveSelection paints its own thin blue border with white square
 * handles, matching the single-selection look. Called from after:render.
 *
 * The painted handles are visual only: the ActiveSelection itself renders
 * no chrome (its hasBorders/hasControls are false) and exists purely so
 * the members move together. Press-drag on a member moves the whole
 * selection; resizing an individual member needs it selected on its own.
 */
export function paintMultiSelectBorders(
  canvas: Canvas,
  ctx: CanvasRenderingContext2D,
): void {
  const active = canvas.getActiveObject();
  if (!(active instanceof ActiveSelection)) return;
  for (const member of active.getObjects()) {
    if (!member.visible) continue;
    member._renderControls(ctx, {
      borderColor: MULTI_SELECT_BORDER_COLOR,
      hasBorders: true,
      hasControls: true,
    });
  }
}
