import { LOCAL_API_BASE } from "../src/api/localService";

export async function assertLocalServerIsHealthy(
  request: typeof fetch = fetch,
): Promise<void> {
  const healthUrl = `${LOCAL_API_BASE}/api/health`;
  try {
    const response = await request(healthUrl, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { status?: unknown };
    if (body.status !== "ok") throw new Error("unexpected health response");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Local project server is required for rendering but ${healthUrl} is not ` +
        `healthy (${detail}). Start it with "npm run dev:server" and retry.`,
    );
  }
}
