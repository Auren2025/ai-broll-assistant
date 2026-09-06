export type LineDrawLayerLike = {
  type: string;
  stroke?: string | null;
  strokeWidth?: number;
};

export function isLineDrawEligible(layer: LineDrawLayerLike): boolean {
  if (layer.type === "arrow") return true;
  return (
    (layer.type === "rectangle" ||
      layer.type === "circle" ||
      layer.type === "triangle") &&
    layer.stroke != null &&
    (layer.strokeWidth ?? 0) > 0
  );
}

export function isLineDrawDirectionValid(
  layer: LineDrawLayerLike,
  direction: string,
): boolean {
  return layer.type === "arrow"
    ? direction === "start-to-end" || direction === "end-to-start"
    : direction === "clockwise" || direction === "counterclockwise";
}
