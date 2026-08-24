import type { ShapeText } from "./shapeTextSchema";

export interface ShapeTextContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getShapeTextContentBox(
  width: number,
  height: number,
  padding: ShapeText["padding"],
): ShapeTextContentBox {
  const horizontalPadding = Math.min(padding, width / 2);
  const verticalPadding = Math.min(padding, height / 2);
  return {
    x: horizontalPadding,
    y: verticalPadding,
    width: Math.max(0, width - horizontalPadding * 2),
    height: Math.max(0, height - verticalPadding * 2),
  };
}
