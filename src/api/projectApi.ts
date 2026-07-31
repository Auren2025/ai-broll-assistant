import { parseProject, type Project } from "../domain/projectSchema";
import { parseScene, type Scene } from "../domain/sceneSchema";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as unknown;

      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        message = body.error;
      }
    } catch {
      // Keep the status-based fallback message.
    }

    throw new Error(message);
  }

  return response.json();
}

export async function fetchProject(projectId: string): Promise<Project> {
  const input = await fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}`,
  );

  return parseProject(input);
}

export async function fetchScene(
  projectId: string,
  sceneId: string,
): Promise<Scene> {
  const input = await fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
  );

  return parseScene(input);
}
