import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { fetchProject, fetchScene } from "../api/projectApi";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import type { InspectorScope } from "./useEditorSelection";
import type { DocumentVersionTracker } from "./versionTracker";

interface ProjectLoadingOptions {
  projectId: string;
  projectRef: RefObject<Project | null>;
  sceneRef: RefObject<Scene | null>;
  versions: DocumentVersionTracker;
  setProject: Dispatch<SetStateAction<Project | null>>;
  setScene: Dispatch<SetStateAction<Scene | null>>;
  setScenesById: Dispatch<SetStateAction<Record<string, Scene>>>;
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  setActiveInsertionGroupId: Dispatch<SetStateAction<string | null>>;
  setSelectedAnimationId: Dispatch<SetStateAction<string | null>>;
  setInspectorScope: Dispatch<SetStateAction<InspectorScope>>;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setHasSaveConflict: Dispatch<SetStateAction<boolean>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  markCurrentStateSaved: () => void;
  clearHistory: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function readProject(projectId: string, signal?: AbortSignal) {
  const project = await fetchProject(projectId, { signal });
  const scenes = await Promise.all(project.scenes.map((reference) =>
    fetchScene(project.id, reference.id, { signal })));
  if (!scenes[0]) throw new Error("Project contains no scenes");
  return { project, scenes };
}

export function useProjectLoading(options: ProjectLoadingOptions) {
  const {
    projectId, projectRef, sceneRef, versions, setProject, setScene, setScenesById,
    setSelectedLayerIds, setActiveInsertionGroupId, setSelectedAnimationId,
    setInspectorScope, setIsDirty, setHasSaveConflict, setLoadError,
    markCurrentStateSaved, clearHistory,
  } = options;

  useEffect(() => {
    const controller = new AbortController();
    void readProject(projectId, controller.signal).then(({ project, scenes }) => {
      if (controller.signal.aborted) return;
      setProject(project);
      setScene(scenes[0]);
      setScenesById(Object.fromEntries(scenes.map((scene) => [scene.id, scene])));
      versions.resetAll();
      setSelectedLayerIds([]);
      setIsDirty(false);
      setHasSaveConflict(false);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(error));
    });
    return () => controller.abort();
  }, [projectId, setHasSaveConflict, setIsDirty, setLoadError, setProject, setScene, setScenesById, setSelectedLayerIds, versions]);

  const applySnapshot = useCallback((project: Project, scenes: Scene[]) => {
    const nextScenes = Object.fromEntries(scenes.map((scene) => [scene.id, scene]));
    const currentSceneId = sceneRef.current?.id;
    const loadedScene = (currentSceneId ? nextScenes[currentSceneId] : undefined) ?? scenes[0];
    if (!loadedScene) throw new Error("Project contains no scenes");
    setProject(project);
    setScene(loadedScene);
    setScenesById(nextScenes);
    setSelectedLayerIds([]);
    setActiveInsertionGroupId(null);
    setSelectedAnimationId(null);
    setInspectorScope("scene");
    versions.markProjectChanged();
    versions.markSceneChanged();
    markCurrentStateSaved();
    clearHistory();
  }, [sceneRef, setProject, setScene, setScenesById, setSelectedLayerIds,
    setActiveInsertionGroupId, setSelectedAnimationId, setInspectorScope,
    versions, markCurrentStateSaved, clearHistory]);

  const loadAllFromDisk = useCallback(async () => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    const { project, scenes } = await readProject(currentProject.id);
    applySnapshot(project, scenes);
  }, [projectRef, applySnapshot]);
  return { applySnapshot, loadAllFromDisk };
}
