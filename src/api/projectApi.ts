import { parseProject, type Project } from "../domain/projectSchema";
import { parseScene, type Scene } from "../domain/sceneSchema";

const resourceEtags = new Map<string, string>();

export class ExternalChangeConflictError extends Error {
  constructor() {
    super("This file changed on disk. Choose which version to keep.");
    this.name = "ExternalChangeConflictError";
  }
}

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

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ body: unknown; response: Response }> {
  const response = await fetch(url, init);
  const body = await readResponseJson(response);

  if (!response.ok) {
    if (response.status === 412) {
      throw new ExternalChangeConflictError();
    }
    throw new Error(
      getErrorMessage(body, `Request failed with status ${response.status}`),
    );
  }

  return { body, response };
}

function rememberEtag(url: string, response: Response): void {
  const etag = response.headers.get("ETag");
  if (etag) resourceEtags.set(url, etag);
}

function conditionalHeaders(url: string, force: boolean): HeadersInit {
  const etag = force ? null : resourceEtags.get(url);
  return {
    "Content-Type": "application/json",
    ...(etag ? { "If-Match": etag } : {}),
  };
}

export async function fetchProject(projectId: string): Promise<Project> {
  const url = `/api/projects/${encodeURIComponent(projectId)}`;
  const { body, response } = await fetchJson(url);
  rememberEtag(url, response);

  return parseProject(body);
}

export async function saveProject(
  project: Project,
  options: { force?: boolean } = {},
): Promise<Project> {
  const validatedProject = parseProject(project);
  const url = `/api/projects/${encodeURIComponent(validatedProject.id)}`;
  const { body, response } = await fetchJson(
    url,
    {
      method: "PUT",
      headers: conditionalHeaders(url, options.force === true),
      body: JSON.stringify(validatedProject),
    },
  );
  rememberEtag(url, response);

  return parseProject(body);
}

export async function fetchScene(
  projectId: string,
  sceneId: string,
): Promise<Scene> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`;
  const { body, response } = await fetchJson(url);
  rememberEtag(url, response);

  return parseScene(body);
}

export async function saveScene(
  projectId: string,
  scene: Scene,
  options: { force?: boolean } = {},
): Promise<Scene> {
  const validatedScene = parseScene(scene);
  const url = `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(validatedScene.id)}`;

  const { body, response } = await fetchJson(
    url,
    {
      method: "PUT",
      headers: conditionalHeaders(url, options.force === true),
      body: JSON.stringify(validatedScene),
    },
  );
  rememberEtag(url, response);

  return parseScene(body);
}

export interface CreateSceneResult {
  project: Project;
  scene: Scene;
}

export async function createScene(
  projectId: string,
): Promise<CreateSceneResult> {
  const { body: input } = await fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}/scenes`,
    {
      method: "POST",
    },
  );

  if (
    typeof input !== "object" ||
    input === null ||
    !("project" in input) ||
    !("scene" in input)
  ) {
    throw new Error("Server returned an unexpected payload for create scene");
  }

  const payload = input as { project: unknown; scene: unknown };
  const createdProject = parseProject(payload.project);
  const createdScene = parseScene(payload.scene);
  const [project, scene] = await Promise.all([
    fetchProject(createdProject.id),
    fetchScene(createdProject.id, createdScene.id),
  ]);

  return { project, scene };
}

export async function deleteScene(
  projectId: string,
  sceneId: string,
): Promise<Project> {
  const { body: input } = await fetchJson(
    `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
    { method: "DELETE" },
  );

  parseProject(input);
  resourceEtags.delete(
    `/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
  );
  return fetchProject(projectId);
}

export interface UploadAssetResult {
  filename: string;
  src: string;
  contentType: string;
  bytes: number;
}

const ALLOWED_ASSET_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const ASSET_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function getAssetUrl(projectId: string, src: string): string {
  if (!src.startsWith("assets/")) {
    throw new Error(`Asset src must start with assets/: ${src}`);
  }
  return `/api/projects/${encodeURIComponent(projectId)}/${src}`;
}

export async function uploadImageAsset(
  projectId: string,
  file: File | Blob,
  filenameHint?: string,
): Promise<UploadAssetResult> {
  const mimeType = file.type.toLowerCase();
  if (!ALLOWED_ASSET_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${file.type || "unknown"}`);
  }

  const extension = ASSET_MIME_EXTENSIONS[mimeType];
  const fallbackName =
    typeof filenameHint === "string" && filenameHint.length > 0
      ? filenameHint
      : `image.${extension}`;

  const url = `/api/projects/${encodeURIComponent(projectId)}/assets`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Asset-Filename": fallbackName,
    },
    body: file,
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { filename?: unknown }).filename !== "string" ||
    typeof (body as { src?: unknown }).src !== "string"
  ) {
    throw new Error("Server returned an unexpected payload for asset upload");
  }

  const payload = body as {
    filename: string;
    src: string;
    contentType?: string;
    bytes?: number;
  };
  return {
    filename: payload.filename,
    src: payload.src,
    contentType: payload.contentType ?? mimeType,
    bytes: payload.bytes ?? 0,
  };
}
