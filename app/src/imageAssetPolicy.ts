export const MAX_IMAGE_ASSET_MIB = 64;
export const MAX_IMAGE_ASSET_BYTES = MAX_IMAGE_ASSET_MIB * 1024 * 1024;

export function getImageAssetSizeError(bytes: number): string | null {
  return bytes > MAX_IMAGE_ASSET_BYTES
    ? `Image exceeds the ${MAX_IMAGE_ASSET_MIB} MiB upload limit`
    : null;
}
