import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ExternalChangeConflictError, fetchProjectResource, fetchSceneResource, saveProject, saveScene } from "../api/projectApi";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { enqueueSave, saveChangedResources, type SaveSnapshot } from "./persistence";
import type { DocumentVersionTracker } from "./versionTracker";

/** State setters and refs that the controller owns. */
export interface SaveControllerHooks {
  documentVersions: DocumentVersionTracker;
  projectRef: { current: Project | null };
  sceneRef: { current: Scene | null };
  scenesByIdRef: { current: Record<string, Scene> };
  activeSaveCountRef: { current: number };
  externalRefreshRunningRef: { current: boolean };
  /**
   * Synchronously true while a scene operation (split/duplicate/add/delete)
   * is in flight. Set before the first await so the external refresh can
   * tell our own in-flight writes apart from another tab's changes.
   */
  sceneOperationActiveRef: { current: boolean };
  /** Initial values used to schedule the auto-save and refresh loop. */
  autoSaveDelayMs: number;
  externalRefreshIntervalMs: number;
}

export interface SaveControllerSetters {
  setIsSaving: (value: boolean) => void;
  setIsSavePending: (value: boolean) => void;
  setSaveError: (message: string | null) => void;
  setHasSaveConflict: (value: boolean) => void;
  setIsExternalRefreshRunning: (value: boolean) => void;
  /** Apply a disk snapshot that overrides the editor state. */
  applyExternalSnapshot: (project: Project, scenes: Scene[]) => void;
  /** Track when a scene save resolves server-side, e.g. to refresh caches. */
  onSceneSaved: (scene: Scene) => void;
  /** Forward unexpected errors so the editor can surface them in its own UI. */
  onExternalError: (message: string) => void;
  /** Mark the current change versions as acknowledged by the disk. */
  markCurrentStateSaved: () => void;
  /** Recompute the dirty flag from the version counters (call after a save). */
  updateDirtyState: () => void;
  /** Clear undo/redo stacks when the disk replaces the in-memory document. */
  clearHistory: () => void;
  /** Reset selection/animation inspector that depend on the prior scene set. */
  resetSelection: () => void;
}

export interface SaveControllerOptions {
  hooks: SaveControllerHooks;
  setters: SaveControllerSetters;
}

interface SaveControllerHandle {
  /** Queue a save using the current project/scene/version snapshot. */
  queueSave(force: boolean): Promise<void>;
  /** Wait for any in-flight or queued saves to finish. */
  flush(): Promise<void>;
  /** Run one pass of the external-refresh poll right now. */
  runExternalRefresh(signal?: AbortSignal): Promise<void>;
}

/** Detect AbortError-shaped DOMExceptions raised by fetch cancellation. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function useSaveController({ hooks, setters }: SaveControllerOptions): SaveControllerHandle {
  const {
    documentVersions,
    projectRef,
    sceneRef,
    scenesByIdRef,
    activeSaveCountRef,
    externalRefreshRunningRef,
    sceneOperationActiveRef,
  } = hooks;

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Callbacks from the editor may change on every render. Keep the public
  // controller stable while always delivering results to the latest handlers.
  const settersRef = useRef(setters);
  useLayoutEffect(() => {
    settersRef.current = setters;
  }, [setters]);

  const buildSnapshot = useCallback((): SaveSnapshot | null => {
    const project = projectRef.current;
    const scene = sceneRef.current;
    if (!project || !scene) return null;
    const { projectVersion, sceneVersion } = documentVersions.snapshot();
    return { project, scene, projectVersion, sceneVersion };
  }, [documentVersions, projectRef, sceneRef]);

  const queueSave = useCallback(
    (force: boolean): Promise<void> => {
      const snapshot = buildSnapshot();
      if (!snapshot) return saveQueueRef.current;

      const { projectVersion, sceneVersion } = snapshot;
      const savedProjectVersion = documentVersions.projectSaved.current;
      const savedSceneVersion = documentVersions.sceneSaved.current;
      const needsProjectSave = projectVersion > savedProjectVersion;
      const needsSceneSave = sceneVersion > savedSceneVersion;
      if (!needsProjectSave && !needsSceneSave && !force) {
        return saveQueueRef.current;
      }

      settersRef.current.setIsSavePending(true);
      const { result, settled } = enqueueSave(saveQueueRef.current, async () => {
        activeSaveCountRef.current += 1;
        settersRef.current.setIsSaving(true);

        try {
          await saveChangedResources(
            snapshot,
            { project: documentVersions.projectSaved, scene: documentVersions.sceneSaved },
            {
              saveProject,
              saveScene,
              onSceneSaved: (scene) => settersRef.current.onSceneSaved(scene),
            },
            force,
          );
          settersRef.current.setHasSaveConflict(false);
          // The save succeeded: sync the dirty flag from the version
          // counters. Without this the UI stays on "Waiting to save…"
          // forever even though everything is on disk. Recomputing (rather
          // than blindly clearing) keeps edits made during the save dirty.
          settersRef.current.updateDirtyState();
        } catch (error: unknown) {
          settersRef.current.setSaveError(error instanceof Error ? error.message : "Unknown error");
          settersRef.current.setHasSaveConflict(error instanceof ExternalChangeConflictError);
          throw error;
        } finally {
          activeSaveCountRef.current -= 1;
          if (activeSaveCountRef.current === 0) settersRef.current.setIsSaving(false);
        }
      });
      saveQueueRef.current = settled.then(() => settersRef.current.setIsSavePending(false));
      return result;
    },
    [
      activeSaveCountRef,
      buildSnapshot,
      documentVersions.projectSaved,
      documentVersions.sceneSaved,
    ],
  );

  const flush = useCallback(() => saveQueueRef.current, []);

  const runExternalRefresh = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (externalRefreshRunningRef.current || sceneOperationActiveRef.current) return;
      externalRefreshRunningRef.current = true;
      settersRef.current.setIsExternalRefreshRunning(true);
      try {
        const beforeProject = projectRef.current;
        if (!beforeProject) return;
        const { projectVersion: beforeProjectVersion, sceneVersion: beforeSceneVersion } =
          documentVersions.snapshot();
        const beforeScenes = beforeProject.scenes.map(
          (reference) => scenesByIdRef.current[reference.id],
        );
        const loadedProjectResource = await fetchProjectResource(beforeProject.id, { signal });
        const loadedProject = loadedProjectResource.data;
        const loadedSceneResources = await Promise.all(
          loadedProject.scenes.map((reference) =>
            fetchSceneResource(loadedProject.id, reference.id, { signal }),
          ),
        );
        const loadedScenes = loadedSceneResources.map((resource) => resource.data);
        const projectChanged = JSON.stringify(loadedProject) !== JSON.stringify(beforeProject);
        const scenesChanged = JSON.stringify(loadedScenes) !== JSON.stringify(beforeScenes);
        const { projectVersion: latestProjectVersion, sceneVersion: latestSceneVersion } =
          documentVersions.snapshot();
        if (
          signal?.aborted ||
          sceneOperationActiveRef.current ||
          latestProjectVersion !== beforeProjectVersion ||
          latestSceneVersion !== beforeSceneVersion ||
          activeSaveCountRef.current > 0
        ) {
          return;
        }
        loadedProjectResource.commitEtag();
        loadedSceneResources.forEach((resource) => resource.commitEtag());
        if (!projectChanged && !scenesChanged) return;
        settersRef.current.applyExternalSnapshot(loadedProject, loadedScenes);
      } catch (error: unknown) {
        if (!isAbortError(error)) settersRef.current.onExternalError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        externalRefreshRunningRef.current = false;
        settersRef.current.setIsExternalRefreshRunning(false);
      }
    },
    [
      activeSaveCountRef,
      documentVersions,
      externalRefreshRunningRef,
      projectRef,
      sceneOperationActiveRef,
      scenesByIdRef,
    ],
  );

  // External refresh loop is not triggered from here; the editor chooses when to call
  // runExternalRefresh (typically from a useEffect interval). Keeping the hook focused
  // on queued persistence avoids coupling the controller to React timing.

  return useMemo(() => ({ queueSave, flush, runExternalRefresh }), [queueSave, flush, runExternalRefresh]);
}

/** Drive the auto-save timer and external-refresh interval around a controller. */
export interface SaveControllerLoopOptions {
  controller: SaveControllerHandle;
  isDirty: boolean;
  hasSaveConflict: boolean;
  isSceneLoading: boolean;
  isCreatingScene: boolean;
  isExternalRefreshRunning: boolean;
  isApplyingHistory: boolean;
  autoSaveDelayMs: number;
  externalRefreshIntervalMs: number;
}

export function useSaveControllerLoop(options: SaveControllerLoopOptions): void {
  const {
    controller,
    isDirty,
    hasSaveConflict,
    isSceneLoading,
    isCreatingScene,
    isExternalRefreshRunning,
    isApplyingHistory,
    autoSaveDelayMs,
    externalRefreshIntervalMs,
  } = options;

  useEffect(() => {
    if (!isDirty || hasSaveConflict || isSceneLoading || isCreatingScene) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void controller.queueSave(false).catch(() => undefined);
    }, autoSaveDelayMs);
    return () => window.clearTimeout(timeout);
  }, [
    autoSaveDelayMs,
    controller,
    hasSaveConflict,
    isCreatingScene,
    isDirty,
    isSceneLoading,
  ]);

  useEffect(() => {
    if (isDirty || isSceneLoading || isCreatingScene || hasSaveConflict || isApplyingHistory) {
      return;
    }
    const abortController = new AbortController();
    const interval = window.setInterval(() => {
      if (isExternalRefreshRunning) return;
      void controller.runExternalRefresh(abortController.signal);
    }, externalRefreshIntervalMs);
    return () => {
      window.clearInterval(interval);
      abortController.abort();
    };
  }, [
    controller,
    externalRefreshIntervalMs,
    hasSaveConflict,
    isApplyingHistory,
    isCreatingScene,
    isDirty,
    isExternalRefreshRunning,
    isSceneLoading,
  ]);
}
