export const LOCAL_API_BASE = "http://127.0.0.1:3002";

export function buildProjectAssetBaseUrl(projectId: string): string {
  return `${LOCAL_API_BASE}/api/projects/${encodeURIComponent(projectId)}`;
}
