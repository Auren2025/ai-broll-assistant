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

// The rectangle the image actually occupies inside its frame under "contain"
// semantics (i.e. the frame with letterbox gaps trimmed off). Returns null
// when any dimension is unusable. Callers keep the frame center fixed so the
// visible image does not jump.
export function fitFrameToImageSize(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number } | null {
  if (
    !Number.isFinite(frameWidth) || frameWidth <= 0 ||
    !Number.isFinite(frameHeight) || frameHeight <= 0 ||
    !Number.isFinite(imageWidth) || imageWidth <= 0 ||
    !Number.isFinite(imageHeight) || imageHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const round = (number: number) => Math.max(1, Math.round(number * 100) / 100);
  return {
    width: round(imageWidth * scale),
    height: round(imageHeight * scale),
  };
}
