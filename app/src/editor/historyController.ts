import { useCallback, useEffect, useRef } from "react";
import {
  deleteScene as deleteSceneRequest,
  saveProject,
  saveScene,
} from "../api/projectApi";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { applyHistoryStep, recordHistorySnapshot } from "./history";
import type { DocumentVersionTracker } from "./versionTracker";

export type HistoryInspectorScope = "scene" | "layer";

export interface EditorSnapshot {
  project: Project;
  scene: Scene;
  scenesById: Record<string, Scene>;
  selectedLayerIds: string[];
  inspectorScope: HistoryInspectorScope;
  isDirty: boolean;
}

export interface HistoryControllerSnapshot {
  /** Editable fields used by React state, e.g. via `useState`. */
  readonly state: EditorSnapshot | null;
  /** Current selection/animation inspector scope after the latest restore. */
  readonly inspectorScope: HistoryInspectorScope;
  /** Stable callbacks used by the editor for input/output. */
  readonly controls: HistoryControllerControls;
}

export interface HistoryControllerControls {
  record: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  /** Refresh undo/redo availability after asynchronous work. */
  refreshAvailability: () => void;
  /** True while a history step is being applied. UI should suspend edits. */
  isApplying: () => boolean;
}

export interface HistoryControllerRefs {
  projectRef: { current: Project | null };
  sceneRef: { current: Scene | null };
  scenesByIdRef: { current: Record<string, Scene> };
  documentVersions: DocumentVersionTracker;
  isApplyingHistoryRef: { current: boolean };
  isSceneLoadingRef: { current: boolean };
}

export interface HistoryControllerSetters {
  setProject: (project: Project) => void;
  setScene: (scene: Scene) => void;
  setScenesById: (
    updater: (current: Record<string, Scene>) => Record<string, Scene>,
  ) => void;
  setSelectedLayerIds: (ids: string[]) => void;
  setActiveInsertionGroupId: (value: string | null) => void;
  setSelectedAnimationId: (value: string | null) => void;
  setInspectorScope: (scope: HistoryInspectorScope) => void;
  setHistoryCanUndo: (value: boolean) => void;
  setHistoryCanRedo: (value: boolean) => void;
  setSaveError: (message: string | null) => void;
  setHasSaveConflict: (value: boolean) => void;
  setSceneError: (message: string | null) => void;
  markCurrentStateSaved: () => void;
  updateDirtyState: () => void;
  getErrorMessage: (error: unknown) => string;
  onConflict?: (error: unknown) => void;
}

export interface UseHistoryControllerOptions {
  refs: HistoryControllerRefs;
  setters: HistoryControllerSetters;
}

export function useHistoryController({ refs, setters }: UseHistoryControllerOptions) {
  const editorSnapshotRef = useRef<EditorSnapshot | null>(null);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);

  const refreshAvailability = useCallback(() => {
    setters.setHistoryCanUndo(undoStackRef.current.length > 0);
    setters.setHistoryCanRedo(redoStackRef.current.length > 0);
  }, [setters]);

  const recordHistory = useCallback(() => {
    if (refs.isApplyingHistoryRef.current || !editorSnapshotRef.current) {
      return;
    }
    recordHistorySnapshot(undoStackRef.current, redoStackRef.current, editorSnapshotRef.current);
    setters.setHistoryCanUndo(true);
    setters.setHistoryCanRedo(false);
  }, [refs.isApplyingHistoryRef, setters]);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setters.setHistoryCanUndo(false);
    setters.setHistoryCanRedo(false);
  }, [setters]);

  const applyHistorySnapshot = useCallback(
    async (snapshot: EditorSnapshot) => {
      const current = editorSnapshotRef.current;
      if (!current) return;
      const projectChanged =
        JSON.stringify(current.project) !== JSON.stringify(snapshot.project);
      const sceneChanged =
        JSON.stringify(current.scene) !== JSON.stringify(snapshot.scene);

      const currentSceneIds = new Set(
        current.project.scenes.map((reference) => reference.id),
      );
      const targetSceneIds = new Set(
        snapshot.project.scenes.map((reference) => reference.id),
      );
      const removedSceneIds = [...currentSceneIds].filter(
        (sceneId) => !targetSceneIds.has(sceneId),
      );
      const restoredSceneIds = [...targetSceneIds].filter(
        (sceneId) => !currentSceneIds.has(sceneId),
      );

      // History restore is an explicit user intent: the snapshot is the source
      // of truth, so writes bypass the If-Match precondition (force). The
      // custom scene endpoints (split/duplicate) rewrite files outside the
      // etag-tracked save flow, which would otherwise fail with 412 here.
      if (restoredSceneIds.length > 0) {
        for (const sceneId of restoredSceneIds) {
          const restoredScene = snapshot.scenesById[sceneId];
          if (!restoredScene) throw new Error(`Missing scene snapshot: ${sceneId}`);
          await saveScene(snapshot.project.id, restoredScene, { force: true });
        }
      } else if (removedSceneIds.length > 0) {
        for (const sceneId of removedSceneIds) {
          await deleteSceneRequest(current.project.id, sceneId);
        }
      }
      // Scenes that exist on both sides but changed content (e.g. the first
      // half of a split scene): write the snapshot's version back, otherwise
      // the on-disk file keeps the post-operation content and a reload would
      // lose data.
      for (const sceneId of targetSceneIds) {
        if (
          currentSceneIds.has(sceneId) &&
          !restoredSceneIds.includes(sceneId)
        ) {
          const before = current.scenesById[sceneId];
          const after = snapshot.scenesById[sceneId];
          if (
            before &&
            after &&
            JSON.stringify(before) !== JSON.stringify(after)
          ) {
            await saveScene(snapshot.project.id, after, { force: true });
          }
        }
      }
      await saveProject(snapshot.project, { force: true });

      setters.setProject(snapshot.project);
      setters.setScene(snapshot.scene);
      setters.setScenesById(() => ({ ...snapshot.scenesById }));
      setters.setSelectedLayerIds(snapshot.selectedLayerIds);
      setters.setActiveInsertionGroupId(null);
      setters.setSelectedAnimationId(null);
      setters.setInspectorScope(snapshot.inspectorScope);
      if (projectChanged) refs.documentVersions.markProjectChanged();
      if (sceneChanged) refs.documentVersions.markSceneChanged();
      setters.markCurrentStateSaved();
      setters.updateDirtyState();
      setters.setSaveError(null);
      setters.setHasSaveConflict(false);
      setters.setSceneError(null);
    },
    [refs.documentVersions, setters],
  );

  const handleUndo = useCallback(async () => {
    if (refs.isApplyingHistoryRef.current || refs.isSceneLoadingRef.current) return;
    const current = editorSnapshotRef.current;
    if (!current || undoStackRef.current.length === 0) return;
    refs.isApplyingHistoryRef.current = true;
    try {
      await applyHistoryStep(
        undoStackRef.current, redoStackRef.current, current, applyHistorySnapshot,
      );
    } catch (error: unknown) {
      setters.setSceneError(setters.getErrorMessage(error));
      setters.onConflict?.(error);
    } finally {
      refs.isApplyingHistoryRef.current = false;
      refreshAvailability();
    }
  }, [applyHistorySnapshot, refreshAvailability, refs.isApplyingHistoryRef, refs.isSceneLoadingRef, setters]);

  const handleRedo = useCallback(async () => {
    if (refs.isApplyingHistoryRef.current || refs.isSceneLoadingRef.current) return;
    const current = editorSnapshotRef.current;
    if (!current || redoStackRef.current.length === 0) return;
    refs.isApplyingHistoryRef.current = true;
    try {
      await applyHistoryStep(
        redoStackRef.current, undoStackRef.current, current, applyHistorySnapshot,
      );
    } catch (error: unknown) {
      setters.setSceneError(setters.getErrorMessage(error));
      setters.onConflict?.(error);
    } finally {
      refs.isApplyingHistoryRef.current = false;
      refreshAvailability();
    }
  }, [applyHistorySnapshot, refreshAvailability, refs.isApplyingHistoryRef, refs.isSceneLoadingRef, setters]);

  return {
    setSnapshot: (snapshot: EditorSnapshot | null) => {
      editorSnapshotRef.current = snapshot;
    },
    get isApplying(): boolean {
      return refs.isApplyingHistoryRef.current;
    },
    controls: {
      record: recordHistory,
      undo: handleUndo,
      redo: handleRedo,
      clear: clearHistory,
      refreshAvailability,
      isApplying: () => refs.isApplyingHistoryRef.current,
    } satisfies HistoryControllerControls,
    stacks: {
      undo: undoStackRef,
      redo: redoStackRef,
    },
  };
}

export type HistoryController = ReturnType<typeof useHistoryController>;

/** Sync the snapshot ref whenever the editor's runtime state changes. */
export function useHistorySnapshotCapture(
  history: HistoryController,
  snapshot: EditorSnapshot | null,
): void {
  useEffect(() => {
    history.setSnapshot(snapshot);
  }, [history, snapshot]);
}