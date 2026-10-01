import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import {
  createDocumentVersionTracker,
  type DocumentVersionTracker,
} from "./versionTracker";
import {
  useHistoryController,
  useHistorySnapshotCapture,
} from "./historyController";
import { useProjectLoading } from "./useProjectLoading";
import { useSceneOperations } from "./useSceneOperations";
import {
  useSaveController,
  useSaveControllerLoop,
} from "./saveController";
import { resolveProjectId } from "../projectSelection";
import type { InspectorScope } from "./useEditorSelection";

const PROJECT_ID = resolveProjectId(
  window.location.search,
  window.location.pathname,
);
const AUTO_SAVE_DELAY_MS = 600;
const EXTERNAL_REFRESH_INTERVAL_MS = 3000;

export interface UseEditorDocumentOptions {
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  setActiveInsertionGroupId: Dispatch<SetStateAction<string | null>>;
  setSelectedAnimationId: Dispatch<SetStateAction<string | null>>;
  setInspectorScope: Dispatch<SetStateAction<InspectorScope>>;
  setSlideMenu: Dispatch<
    SetStateAction<{ sceneId: string; x: number; y: number } | null>
  >;
  getErrorMessage: (error: unknown) => string;
  /** Selection state owned by App, captured into undo snapshots. */
  selectedLayerIds: readonly string[];
  inspectorScope: InspectorScope;
}

export interface EditorDocumentApi {
  project: Project | null;
  scene: Scene | null;
  scenesById: Record<string, Scene>;
  projectRef: RefObject<Project | null>;
  sceneRef: RefObject<Scene | null>;
  isDirty: boolean;
  isSaving: boolean;
  isSceneLoading: boolean;
  isCreatingScene: boolean;
  historyCanUndo: boolean;
  historyCanRedo: boolean;
  loadError: string | null;
  sceneError: string | null;
  setSceneError: (message: string | null) => void;
  saveError: string | null;
  hasSaveConflict: boolean;
  createSceneError: string | null;
  /** True while a scene operation or history apply is in flight. */
  sceneOperationRunning: boolean;
  isApplyingHistory: boolean;
  /** Fresh read of the in-flight flags, for async callbacks that need the
   *  value after an await rather than the render-time snapshot. */
  isDocumentBusy: () => boolean;
  handleSceneChange: (scene: Scene) => void;
  handleProjectChange: (project: Project) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  queueCurrentSave: (force?: boolean) => Promise<void>;
  handleReloadExternalChanges: () => Promise<void>;
  handleOverwriteExternalChanges: () => void;
  sceneOperations: ReturnType<typeof useSceneOperations>;
}

/**
 * Owns the document cluster: project/scene/scenes state, the version
 * tracker, autosave + external-refresh, project loading, undo history and
 * scene operations (select/add/delete/duplicate/split). Selection and other
 * UI state stay in App; this hook only receives the setters it needs to
 * restore selection on undo and to drive scene operations.
 */
export function useEditorDocument(
  options: UseEditorDocumentOptions,
): EditorDocumentApi {
  const {
    setSelectedLayerIds,
    setActiveInsertionGroupId,
    setSelectedAnimationId,
    setInspectorScope,
    setSlideMenu,
    getErrorMessage,
    selectedLayerIds,
    inspectorScope,
  } = options;

  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [scenesById, setScenesById] = useState<Record<string, Scene>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasSaveConflict, setHasSaveConflict] = useState(false);
  const [createSceneError, setCreateSceneError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(false);
  const [isCreatingScene, setIsCreatingScene] = useState(false);
  const [historyCanUndo, setHistoryCanUndo] = useState(false);
  const [historyCanRedo, setHistoryCanRedo] = useState(false);

  const isApplyingHistoryRef = useRef(false);
  const isSceneLoadingRef = useRef(false);
  const projectRef = useRef<Project | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const versionTracker = useRef<DocumentVersionTracker | null>(null);
  if (versionTracker.current === null) {
    versionTracker.current = createDocumentVersionTracker();
  }
  const documentVersions = versionTracker.current;
  const activeSaveCountRef = useRef(0);
  const externalRefreshRunningRef = useRef(false);
  const sceneOperationRunningRef = useRef(false);
  /** Synchronous in-flight flag for split/duplicate/add/delete; see saveController. */
  const sceneOperationActiveRef = useRef(false);
  const scenesByIdRef = useRef<Record<string, Scene>>({});

  projectRef.current = project;
  sceneRef.current = scene;
  sceneOperationRunningRef.current = isSceneLoading || isCreatingScene;
  scenesByIdRef.current = scenesById;
  isSceneLoadingRef.current = isSceneLoading;

  const updateDirtyState = useCallback(() => {
    setIsDirty(documentVersions.isDirty());
  }, [documentVersions]);

  const markProjectChanged = useCallback(() => {
    documentVersions.markProjectChanged();
    setIsDirty(true);
    setSaveError(null);
  }, [documentVersions]);

  const markSceneChanged = useCallback(() => {
    documentVersions.markSceneChanged();
    setIsDirty(true);
    setSaveError(null);
  }, [documentVersions]);

  const markCurrentStateSaved = useCallback(() => {
    documentVersions.markCurrentStateSaved();
    setIsDirty(false);
    setSaveError(null);
    setHasSaveConflict(false);
  }, [documentVersions]);

  // The `refs` and `setters` objects are passed straight through to
  // `useHistoryController`, where every callback reads them as a dependency.
  // If we let them be fresh object literals on every render, the callbacks
  // produced by that hook (and therefore `handleSceneChange`,
  // `syncObjectsToScene`, and the entire Fabric.js canvas-setup effect that
  // depends on the latter) would all churn every time *any* parent state
  // changes — including the lightweight `setHoveredLayerId` that fires on
  // every mouse move over the canvas. That churn tears the canvas down and
  // rebuilds it on each frame, which shows up as several visual flickers
  // per hover. Memoize both objects so their identities stay stable; all of
  // the members they carry are already stable refs/state setters.
  const historyControllerRefs = useMemo(
    () => ({
      projectRef,
      sceneRef,
      scenesByIdRef,
      documentVersions,
      isApplyingHistoryRef,
      isSceneLoadingRef,
      sceneOperationActiveRef,
    }),
    [documentVersions],
  );
  const historyControllerSetters = useMemo(
    () => ({
      setProject,
      setScene,
      setScenesById,
      setSelectedLayerIds,
      setActiveInsertionGroupId,
      setSelectedAnimationId,
      setInspectorScope,
      setHistoryCanUndo,
      setHistoryCanRedo,
      setSaveError,
      setHasSaveConflict,
      setSceneError,
      markCurrentStateSaved,
      updateDirtyState,
      getErrorMessage,
    }),
    [
      getErrorMessage,
      markCurrentStateSaved,
      setActiveInsertionGroupId,
      setInspectorScope,
      setSelectedAnimationId,
      setSelectedLayerIds,
      updateDirtyState,
    ],
  );
  const historyController = useHistoryController({
    refs: historyControllerRefs,
    setters: historyControllerSetters,
  });
  const recordHistory = historyController.controls.record;
  const clearHistory = historyController.controls.clear;
  const handleUndo = historyController.controls.undo;
  const handleRedo = historyController.controls.redo;

  const handleSceneChange = useCallback((updatedScene: Scene) => {
    if (sceneOperationRunningRef.current || isApplyingHistoryRef.current) return;
    recordHistory();
    setScene(updatedScene);
    markSceneChanged();
  }, [markSceneChanged, recordHistory]);

  const handleProjectChange = useCallback((updatedProject: Project) => {
    if (sceneOperationRunningRef.current || isApplyingHistoryRef.current) return;
    recordHistory();
    setProject(updatedProject);
    markProjectChanged();
  }, [markProjectChanged, recordHistory]);

  useHistorySnapshotCapture(
    historyController,
    project && scene
      ? {
          project,
          scene,
          scenesById: { ...scenesById, [scene.id]: scene },
          selectedLayerIds: [...selectedLayerIds],
          inspectorScope,
          isDirty,
        }
      : null,
  );

  const { applySnapshot, loadAllFromDisk } = useProjectLoading({
    projectId: PROJECT_ID, projectRef, sceneRef, versions: documentVersions,
    setProject, setScene, setScenesById, setSelectedLayerIds,
    setActiveInsertionGroupId, setSelectedAnimationId, setInspectorScope,
    setIsDirty, setHasSaveConflict, setLoadError, markCurrentStateSaved, clearHistory,
  });

  const saveController = useSaveController({
    hooks: {
      documentVersions,
      projectRef,
      sceneRef,
      scenesByIdRef,
      activeSaveCountRef,
      externalRefreshRunningRef,
      sceneOperationActiveRef,
      autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
      externalRefreshIntervalMs: EXTERNAL_REFRESH_INTERVAL_MS,
    },
    setters: {
      setIsSaving,
      setIsSavePending: () => {},
      setSaveError,
      setHasSaveConflict,
      setIsExternalRefreshRunning: () => {},
       applyExternalSnapshot: applySnapshot,
      onSceneSaved: (savedScene) => {
        setScenesById((current) => ({
          ...current,
          [savedScene.id]: savedScene,
        }));
      },
      onExternalError: (message) => setSceneError(message),
      markCurrentStateSaved,
      updateDirtyState,
      clearHistory,
      resetSelection: () => {},
    },
  });
  const queueCurrentSave = useCallback(
    (force = false) => saveController.queueSave(force),
    [saveController],
  );

  useSaveControllerLoop({
    controller: saveController,
    isDirty,
    hasSaveConflict,
    isSceneLoading,
    isCreatingScene,
    isExternalRefreshRunning: externalRefreshRunningRef.current,
    isApplyingHistory: isApplyingHistoryRef.current,
    autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
    externalRefreshIntervalMs: EXTERNAL_REFRESH_INTERVAL_MS,
  });

  useEffect(() => {
    const warnBeforeClosing = (event: BeforeUnloadEvent): void => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [isDirty]);

  const handleReloadExternalChanges = useCallback(async () => {
    setIsSceneLoading(true);
    setSceneError(null);
    try {
      await saveController.flush();
      await loadAllFromDisk();
    } catch (error: unknown) {
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }, [getErrorMessage, loadAllFromDisk, saveController]);

  const handleOverwriteExternalChanges = useCallback(() => {
    setHasSaveConflict(false);
    void queueCurrentSave(true).catch(() => undefined);
  }, [queueCurrentSave]);

  const isDocumentBusy = useCallback(
    () => sceneOperationRunningRef.current || isApplyingHistoryRef.current,
    [],
  );

  const sceneOperations = useSceneOperations({
    document: { project, scene, scenesById, isSceneLoading, isCreatingScene, hasSaveConflict, sceneOperationActiveRef },
    state: {
      setProject, setScene, setScenesById, setSelectedLayerIds,
      setActiveInsertionGroupId, setSelectedAnimationId, setInspectorScope,
      setIsSceneLoading, setIsCreatingScene, setSceneError, setCreateSceneError, setSlideMenu,
    },
    actions: {
      queueCurrentSave, recordHistory, undoStack: historyController.stacks.undo,
      markCurrentStateSaved, handleProjectChange, versions: documentVersions,
    },
  });

  return {
    project,
    scene,
    scenesById,
    projectRef,
    sceneRef,
    isDirty,
    isSaving,
    isSceneLoading,
    isCreatingScene,
    historyCanUndo,
    historyCanRedo,
    loadError,
    sceneError,
    setSceneError,
    saveError,
    hasSaveConflict,
    createSceneError,
    sceneOperationRunning: sceneOperationRunningRef.current,
    isApplyingHistory: isApplyingHistoryRef.current,
    isDocumentBusy,
    handleSceneChange,
    handleProjectChange,
    handleUndo,
    handleRedo,
    queueCurrentSave,
    handleReloadExternalChanges,
    handleOverwriteExternalChanges,
    sceneOperations,
  };
}
