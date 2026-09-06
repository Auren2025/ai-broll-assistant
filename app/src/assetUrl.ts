export function resolveAssetUrl(assetBaseUrl: string, src: string): string {
  return `${assetBaseUrl.replace(/\/$/, "")}/${src}`;
}
