import type { ImageFit } from "../domain/imageLayerSchema";

export function imagePlacement(
  fit: ImageFit,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  focalX: number,
  focalY: number,
): { x: number; y: number; width: number; height: number } {
  if (fit === "fill") {
    return {
      x: -frameWidth / 2,
      y: -frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
    };
  }

  const scale =
    fit === "cover"
      ? Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
      : Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const positionX = fit === "cover" ? focalX : 0.5;
  const positionY = fit === "cover" ? focalY : 0.5;

  return {
    x: -frameWidth / 2 + (frameWidth - width) * positionX,
    y: -frameHeight / 2 + (frameHeight - height) * positionY,
    width,
    height,
  };
}
