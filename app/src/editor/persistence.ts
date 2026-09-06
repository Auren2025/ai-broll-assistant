import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";

interface VersionRef {
  current: number;
}

export interface SaveSnapshot {
  project: Project;
  scene: Scene;
  projectVersion: number;
  sceneVersion: number;
}

interface SaveResources {
  saveProject: (project: Project, options: { force: boolean }) => Promise<unknown>;
  saveScene: (projectId: string, scene: Scene, options: { force: boolean }) => Promise<unknown>;
  onSceneSaved: (scene: Scene) => void;
}

/** Keep caller-visible failures without poisoning the next queued save. */
export function enqueueSave(previous: Promise<void>, save: () => Promise<void>) {
  const result = previous.then(save);
  return { result, settled: result.catch(() => undefined) };
}

/** Save captured versions, not newer edits made while I/O is pending. */
export async function saveChangedResources(
  snapshot: SaveSnapshot,
  savedVersions: { project: VersionRef; scene: VersionRef },
  resources: SaveResources,
  force = false,
): Promise<void> {
  const { project, scene, projectVersion, sceneVersion } = snapshot;
  if (projectVersion > savedVersions.project.current) {
    await resources.saveProject(project, { force });
    savedVersions.project.current = Math.max(savedVersions.project.current, projectVersion);
  }
  if (sceneVersion > savedVersions.scene.current) {
    await resources.saveScene(project.id, scene, { force });
    savedVersions.scene.current = Math.max(savedVersions.scene.current, sceneVersion);
    resources.onSceneSaved(scene);
  }
}
