import type { ImageFit } from "../domain/imageLayerSchema";

// Placement of an image inside its frame, in frame-centered coordinates
// (origin at the frame center, matching Fabric's object space).
//
// `zoom` magnifies the image within a cover crop. 1 keeps the classic cover
// behavior (image just covers the frame); larger values scale the drawn
// image about the focal point, which stays pinned to the same frame
// position while zooming — the same math as CSS
// `object-fit: cover` + `transform: scale(zoom)` with
// `transform-origin: focalX focalY`, so the Fabric canvas and the
// Remotion/CSS renderers agree. Zoom is ignored for "fill" and "contain".
export function imagePlacement(
  fit: ImageFit,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  focalX: number,
  focalY: number,
  zoom = 1,
): { x: number; y: number; width: number; height: number } {
  if (fit === "fill") {
    return {
      x: -frameWidth / 2,
      y: -frameHeight / 2,
      width: frameWidth,
      height: frameHeight,
    };
  }

  const effectiveZoom = fit === "cover" ? Math.max(1, zoom) : 1;
  const scale =
    (fit === "cover"
      ? Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
      : Math.min(frameWidth / imageWidth, frameHeight / imageHeight)) *
    effectiveZoom;
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
