export const LOCAL_API_BASE = "http://127.0.0.1:3001";

export function buildAssetUrl(projectId: string, src: string): string {
  return `${LOCAL_API_BASE}/api/projects/${encodeURIComponent(projectId)}/${src}`;
}
