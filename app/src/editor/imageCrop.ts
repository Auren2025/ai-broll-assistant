// Shared constants for the image crop interaction (canvas crop mode,
// inspector zoom slider, and renderers).

/** Minimum crop zoom: the image just covers the frame (classic cover). */
export const IMAGE_CROP_ZOOM_MIN = 1;

/** Maximum crop zoom offered by the zoom handle and the inspector slider. */
export const IMAGE_CROP_ZOOM_MAX = 8;

/** Opacity of the full-image ghost painted outside the crop frame. */
export const IMAGE_CROP_GHOST_ALPHA = 0.35;

export function clampImageCropZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return IMAGE_CROP_ZOOM_MIN;
  return Math.min(
    IMAGE_CROP_ZOOM_MAX,
    Math.max(IMAGE_CROP_ZOOM_MIN, zoom),
  );
}

export function clampFocal(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
