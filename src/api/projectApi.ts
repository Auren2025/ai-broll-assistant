import { parseProject, type Project } from "../domain/projectSchema";
import { parseScene, type Scene } from "../domain/sceneSchema";

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Request failed with status ${response.status}`);
  }
}

function getErrorMessage(input: unknown, fallback: string): string {
  if (
    typeof input === "object" &&
    input !== null &&
    "error" in input &&
    typeof input.error === "string"
  ) {
    return input.error;
  }

  return fallback;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await readResponseJson(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(body, `Request failed with status ${response.status}`),
    );
  }

  return body;
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

export async function saveScene(
  projectId: string,
  scene: Scene,
): Promise<Scene> {
  const validatedScene = parseScene(scene);

  const input = await fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(validatedScene.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validatedScene),
    },
  );

  return parseScene(input);
}
