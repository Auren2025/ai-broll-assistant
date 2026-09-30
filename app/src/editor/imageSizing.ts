export function matchingImageSize(
  dimension: "width" | "height",
  value: number,
  aspectRatio: number,
): { width: number; height: number } {
  const size = Math.max(1, value);
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error("Image aspect ratio must be positive");
  }
  const round = (number: number) => Math.max(1, Math.round(number * 100) / 100);
  return dimension === "width"
    ? { width: size, height: round(size / aspectRatio) }
    : { width: round(size * aspectRatio), height: size };
}
