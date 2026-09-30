import type { Dispatch, RefObject, SetStateAction } from "react";
import { createScene, deleteScene as deleteSceneRequest, duplicateScene as duplicateSceneRequest, fetchScene, splitScene as splitSceneRequest } from "../api/projectApi";
import { moveSceneReference } from "../domain/sceneOrder";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import type { InspectorScope } from "./useEditorSelection";
import type { DocumentVersionTracker } from "./versionTracker";

interface SceneOperationsOptions {
  document: {
    project: Project | null;
    scene: Scene | null;
    scenesById: Record<string, Scene>;
    isSceneLoading: boolean;
    isCreatingScene: boolean;
    hasSaveConflict: boolean;
  };
  state: {
    setProject: Dispatch<SetStateAction<Project | null>>;
    setScene: Dispatch<SetStateAction<Scene | null>>;
    setScenesById: Dispatch<SetStateAction<Record<string, Scene>>>;
    setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
    setActiveInsertionGroupId: Dispatch<SetStateAction<string | null>>;
    setSelectedAnimationId: Dispatch<SetStateAction<string | null>>;
    setInspectorScope: Dispatch<SetStateAction<InspectorScope>>;
    setIsSceneLoading: Dispatch<SetStateAction<boolean>>;
    setIsCreatingScene: Dispatch<SetStateAction<boolean>>;
    setSceneError: Dispatch<SetStateAction<string | null>>;
    setCreateSceneError: Dispatch<SetStateAction<string | null>>;
    setSlideMenu: Dispatch<SetStateAction<{ sceneId: string; x: number; y: number } | null>>;
  };
  actions: {
    queueCurrentSave: (force?: boolean) => Promise<void>;
    recordHistory: () => void;
    undoStack: RefObject<unknown[]>;
    markCurrentStateSaved: () => void;
    clearHistory: () => void;
    handleProjectChange: (project: Project) => void;
    versions: DocumentVersionTracker;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function useSceneOperations({ document, state, actions }: SceneOperationsOptions) {
  const { project, scene, scenesById, isSceneLoading, isCreatingScene, hasSaveConflict } = document;
  const {
    setProject, setScene, setScenesById, setSelectedLayerIds,
    setActiveInsertionGroupId, setSelectedAnimationId, setInspectorScope,
    setIsSceneLoading, setIsCreatingScene, setSceneError, setCreateSceneError, setSlideMenu,
  } = state;
  const {
    queueCurrentSave, recordHistory, undoStack, markCurrentStateSaved,
    clearHistory, handleProjectChange, versions,
  } = actions;

  async function selectScene(
    sceneId: string, nextSelectedLayerIds: string[] = [], nextScope: InspectorScope = "scene",
  ): Promise<Scene | null> {
    if (!project) return null;
    if (sceneId === scene?.id) {
      setActiveInsertionGroupId(null);
      setSelectedLayerIds(nextSelectedLayerIds);
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      return scene;
    }
    if (isSceneLoading || hasSaveConflict) return null;
    setIsSceneLoading(true);
    setSceneError(null);
    try {
      await queueCurrentSave();
      const loadedScene = await fetchScene(project.id, sceneId);
      setScene(loadedScene);
      setScenesById((current) => ({ ...current, [loadedScene.id]: loadedScene }));
      setSelectedLayerIds(nextSelectedLayerIds);
      setActiveInsertionGroupId(null);
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      versions.markSceneChanged();
      markCurrentStateSaved();
      clearHistory();
      return loadedScene;
    } catch (error: unknown) {
      setSceneError(errorMessage(error));
      return null;
    } finally {
      setIsSceneLoading(false);
    }
  }

  async function deleteScene(): Promise<void> {
    if (!project || !scene || isSceneLoading) return;
    if (project.scenes.length <= 1) {
      setSceneError("A project must contain at least one scene");
      return;
    }
    recordHistory();
    setIsSceneLoading(true);
    setSceneError(null);
    try {
      await queueCurrentSave();
      const deletedIndex = project.scenes.findIndex((reference) => reference.id === scene.id);
      const nextProject = await deleteSceneRequest(project.id, scene.id);
      const nextReference = nextProject.scenes[Math.min(deletedIndex, nextProject.scenes.length - 1)];
      if (!nextReference) throw new Error("Project contains no scenes");
      const nextScene = scenesById[nextReference.id] ?? await fetchScene(nextProject.id, nextReference.id);
      setProject(nextProject);
      setScene(nextScene);
      setScenesById((current) => {
        const next = { ...current };
        delete next[scene.id];
        return next;
      });
      setSelectedLayerIds([]);
      setSelectedAnimationId(null);
      setInspectorScope("scene");
      versions.markProjectChanged();
      versions.markSceneChanged();
      markCurrentStateSaved();
    } catch (error: unknown) {
      undoStack.current.pop();
      setSceneError(errorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }

  async function addScene(index?: number): Promise<void> {
    if (!project || isCreatingScene) return;
    setSlideMenu(null);
    setIsCreatingScene(true);
    setCreateSceneError(null);
    setSceneError(null);
    recordHistory();
    try {
      await queueCurrentSave();
      const { project: nextProject, scene: newScene } = await createScene(
        project.id, project.kind === "slide" ? index ?? project.scenes.length : undefined,
      );
      setProject(nextProject);
      setScene(newScene);
      setScenesById((current) => ({ ...current, [newScene.id]: newScene }));
      setSelectedLayerIds([]);
      setInspectorScope("scene");
      versions.markProjectChanged();
      versions.markSceneChanged();
      markCurrentStateSaved();
    } catch (error: unknown) {
      undoStack.current.pop();
      setCreateSceneError(errorMessage(error));
    } finally {
      setIsCreatingScene(false);
    }
  }

  function moveScene(sceneId: string, insertionIndex: number): void {
    if (!project || project.kind !== "slide" || isSceneLoading || isCreatingScene || hasSaveConflict) return;
    const scenes = moveSceneReference(project.scenes, sceneId, insertionIndex);
    if (!scenes) return;
    setSlideMenu(null);
    handleProjectChange({ ...project, scenes });
  }

  async function duplicateScene(sceneId: string): Promise<void> {
    if (!project || isCreatingScene) return;
    setSlideMenu(null);
    setIsCreatingScene(true);
    setCreateSceneError(null);
    setSceneError(null);
    recordHistory();
    try {
      await queueCurrentSave();
      const { project: nextProject, scene: newScene } = await duplicateSceneRequest(project.id, sceneId);
      setProject(nextProject);
      setScene(newScene);
      setScenesById((current) => ({ ...current, [newScene.id]: newScene }));
      setSelectedLayerIds([]);
      setSelectedAnimationId(null);
      setInspectorScope("scene");
      versions.markProjectChanged();
      versions.markSceneChanged();
      markCurrentStateSaved();
    } catch (error: unknown) {
      undoStack.current.pop();
      setCreateSceneError(errorMessage(error));
    } finally {
      setIsCreatingScene(false);
    }
  }

  async function splitScene(sceneId: string, splitFrame: number): Promise<number> {
    if (!project || isCreatingScene) return 0;
    setIsCreatingScene(true);
    setCreateSceneError(null);
    setSceneError(null);
    recordHistory();
    try {
      await queueCurrentSave();
      const {
        project: nextProject,
        firstScene,
        secondScene,
        removedAnimationCount,
      } = await splitSceneRequest(project.id, sceneId, splitFrame);
      setProject(nextProject);
      // Stay on the first half: it keeps the source scene id, and its layer
      // ids are unchanged so the current layer selection stays valid.
      setScene(firstScene);
      setScenesById((current) => ({
        ...current,
        [firstScene.id]: firstScene,
        [secondScene.id]: secondScene,
      }));
      setSelectedAnimationId(null);
      setInspectorScope("scene");
      versions.markProjectChanged();
      versions.markSceneChanged();
      markCurrentStateSaved();
      return removedAnimationCount;
    } catch (error: unknown) {
      undoStack.current.pop();
      setCreateSceneError(errorMessage(error));
      return 0;
    } finally {
      setIsCreatingScene(false);
    }
  }

  return { selectScene, deleteScene, addScene, moveScene, duplicateScene, splitScene };
}
