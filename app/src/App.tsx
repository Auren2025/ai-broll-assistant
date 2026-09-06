import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PlayerRef } from "@remotion/player";
import "./App.css";
import {
  createScene,
  deleteScene as deleteSceneRequest,
  fetchProject,
  fetchScene,
  uploadImageAsset,
} from "./api/projectApi";
import type { LayerAnimation } from "./domain/layerAnimationSchema";
import { isLineDrawEligible } from "./domain/lineDraw";
import type { Project } from "./domain/projectSchema";
import type { Layer, Scene } from "./domain/sceneSchema";
import {
  canFlattenGroup,
  findLayerById,
  moveLayerTo,
  scaleGroupChildren,
  updateLayerById,
  type ZOrderAction,
} from "./domain/groupOperations";
import { type AlignmentAction } from "./editor/alignment";
import { EditorToolbar } from "./editor/EditorToolbar";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { LayerAnimationPanel } from "./editor/LayerAnimationPanel";
import { RemotionScenePlayer } from "./remotion/RemotionScenePlayer";
import { SceneAnimationTimeline } from "./editor/SceneAnimationTimeline";
import {
  LayerPropertiesPanel,
  MultiLayerPropertiesPanel,
} from "./editor/LayerPropertiesPanel";
import type { EditableLayerPatch } from "./editor/layerEditing";
import {
  SceneLayerTree,
  type LayerMoveRequest,
} from "./editor/SceneLayerTree";
import { ScenePropertiesPanel } from "./editor/ScenePropertiesPanel";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./preview/previewChannel";
import { computeTextBoxSize } from "./editor/textMetrics";
import { resolveProjectId } from "./projectSelection";

import {
  useHistoryController,
  useHistorySnapshotCapture,
} from "./editor/historyController";
import { useLayerCommands, type AddableLayerType } from "./editor/layerCommands";
import {
  useSaveController,
  useSaveControllerLoop,
} from "./editor/saveController";
import {
  createDocumentVersionTracker,
  type DocumentVersionTracker,
} from "./editor/versionTracker";

const PROJECT_ID = resolveProjectId(
  window.location.search,
  window.location.pathname,
);
const DEFAULT_TIMELINE_HEIGHT = 224;
const MIN_TIMELINE_HEIGHT = 120;
const MIN_CANVAS_HEIGHT = 240;
const AUTO_SAVE_DELAY_MS = 600;
const EXTERNAL_REFRESH_INTERVAL_MS = 3000;

type InspectorTab = "design" | "animate";
type InspectorScope = "scene" | "layer";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hasSameLayerIds(
  first: readonly string[],
  second: readonly string[],
): boolean {
  return (
    first.length === second.length &&
    first.every((layerId) => second.includes(layerId))
  );
}

function findParentGroup(layers: readonly Layer[], layerId: string) {
  return layers.find(
    (layer) =>
      layer.type === "group" &&
      layer.children.some((child) => child.id === layerId),
  );
}

function App() {
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
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [activeInsertionGroupId, setActiveInsertionGroupId] = useState<
    string | null
  >(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(
    null,
  );
  const [timelineHeight, setTimelineHeight] = useState(
    DEFAULT_TIMELINE_HEIGHT,
  );
  const [isTimelineResizing, setIsTimelineResizing] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const BASE_CANVAS_SCALE = 0.5;
  const MIN_CANVAS_ZOOM = 0.5;
  const MAX_CANVAS_ZOOM = 6;
  const ZOOM_STEP = 0.25;

  function clampCanvasZoom(value: number): number {
    return Math.min(Math.max(value, MIN_CANVAS_ZOOM), MAX_CANVAS_ZOOM);
  }

  const canvasCursorRef = useRef<{ x: number; y: number } | null>(null);

  function zoomCanvasBy(delta: number): void {
    canvasCursorRef.current = null;
    setCanvasZoom((current) => clampCanvasZoom(current + delta));
  }

  function resetCanvasZoom(): void {
    canvasCursorRef.current = null;
    setCanvasZoom(1);
  }
  const [inspectorScope, setInspectorScope] = useState<InspectorScope>("scene");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextEditLayerId, setPendingTextEditLayerId] = useState<
    string | null
  >(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [historyCanUndo, setHistoryCanUndo] = useState(false);
  const [historyCanRedo, setHistoryCanRedo] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const previewPlayerRef = useRef<PlayerRef | null>(null);
  const clipboardLayersRef = useRef<Layer[] | null>(null);
  const replaceImageTargetIdRef = useRef<string | null>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const previewStateRef = useRef<PreviewStateMessage | null>(null);
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
  const scenesByIdRef = useRef<Record<string, Scene>>({});
  const timelineResizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    maximumHeight: number;
  } | null>(null);
  const selectedLayerId =
    selectedLayerIds.length === 1 ? (selectedLayerIds[0] ?? null) : null;

  projectRef.current = project;
  sceneRef.current = scene;
  sceneOperationRunningRef.current = isSceneLoading || isCreatingScene;
  scenesByIdRef.current = scenesById;
  isSceneLoadingRef.current = isSceneLoading;

  useEffect(() => {
    setActiveInsertionGroupId((current) => {
      if (!current || !scene) return null;
      const group = findLayerById(scene.layers, current);
      return group?.type === "group" && !group.locked ? current : null;
    });
  }, [scene]);

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

  const historyController = useHistoryController({
    refs: {
      projectRef,
      sceneRef,
      scenesByIdRef,
      documentVersions,
      isApplyingHistoryRef,
      isSceneLoadingRef,
    },
    setters: {
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
    },
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

  const layerCommands = useLayerCommands({
    state: {
      selection: {
        scene,
        selectedLayerIds,
        inspectorScope,
        activeInsertionGroupId,
      },
      project,
      isUploadingImage,
      sceneOperationRunning: sceneOperationRunningRef.current,
      isApplyingHistory: isApplyingHistoryRef.current,
    },
    refs: {
      clipboardLayersRef,
      replaceImageTargetIdRef,
      sceneRef,
    },
    setters: {
      setSelectedLayerIds,
      setSelectedAnimationId,
      setInspectorScope,
      setActiveInsertionGroupId,
      setContextMenu,
      setSceneError,
      setPendingTextEditLayerId,
      setImageUploadError,
    },
    handlers: {
      handleSceneChange,
      handleProjectChange,
      getErrorMessage,
    },
  });

  function clampTimelineHeight(value: number, maximumHeight: number): number {
    return Math.min(Math.max(value, MIN_TIMELINE_HEIGHT), maximumHeight);
  }

  function handleTimelineResizeStart(
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    const workspace = event.currentTarget.closest<HTMLElement>(
      ".canvas-workspace",
    );
    if (!workspace) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: timelineHeight,
      maximumHeight: Math.max(
        MIN_TIMELINE_HEIGHT,
        workspace.clientHeight - MIN_CANVAS_HEIGHT - 7,
      ),
    };
    setIsTimelineResizing(true);
  }

  function handleTimelineResizeMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    const resize = timelineResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    setTimelineHeight(
      clampTimelineHeight(
        resize.startHeight - (event.clientY - resize.startY),
        resize.maximumHeight,
      ),
    );
  }

  function handleTimelineResizeEnd(
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (timelineResizeRef.current?.pointerId !== event.pointerId) return;
    timelineResizeRef.current = null;
    setIsTimelineResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleTimelineResizeKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const workspace = event.currentTarget.closest<HTMLElement>(
      ".canvas-workspace",
    );
    if (!workspace) return;

    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const maximumHeight = Math.max(
      MIN_TIMELINE_HEIGHT,
      workspace.clientHeight - MIN_CANVAS_HEIGHT - 7,
    );
    setTimelineHeight((current) =>
      clampTimelineHeight(current + direction * step, maximumHeight),
    );
  }

  previewStateRef.current =
    project && scene
      ? {
          type: "state",
          project,
          scene,
          isDirty,
        }
      : null;

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

  useEffect(() => {
    const abortController = new AbortController();

    async function loadProject(): Promise<void> {
      try {
        const loadedProject = await fetchProject(PROJECT_ID, {
          signal: abortController.signal,
        });
        const loadedScenes = await Promise.all(
          loadedProject.scenes.map((sceneReference) =>
            fetchScene(loadedProject.id, sceneReference.id, {
              signal: abortController.signal,
            }),
          ),
        );
        const loadedScene = loadedScenes[0];

        if (!loadedScene) {
          throw new Error("Project contains no scenes");
        }

        if (!abortController.signal.aborted) {
          setProject(loadedProject);
          setScene(loadedScene);
          setScenesById(
            Object.fromEntries(
              loadedScenes.map((candidate) => [candidate.id, candidate]),
            ),
          );
          documentVersions.resetAll();
          setSelectedLayerIds([]);
          setIsDirty(false);
          setHasSaveConflict(false);
        }
      } catch (error: unknown) {
        if (!abortController.signal.aborted) {
          setLoadError(getErrorMessage(error));
        }
      }
    }

    void loadProject();

    return () => {
      abortController.abort();
    };
  }, [documentVersions]);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    previewChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<PreviewSyncMessage>) => {
      if (event.data.type === "ready" && previewStateRef.current) {
        channel.postMessage(previewStateRef.current);
      }
    };

    return () => {
      channel.close();
      previewChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!project || !scene) {
      return;
    }

    previewChannelRef.current?.postMessage({
      type: "state",
      project,
      scene,
      isDirty,
    } satisfies PreviewStateMessage);
  }, [isDirty, project, scene]);

  const saveController = useSaveController({
    hooks: {
      documentVersions,
      projectRef,
      sceneRef,
      scenesByIdRef,
      activeSaveCountRef,
      externalRefreshRunningRef,
      autoSaveDelayMs: AUTO_SAVE_DELAY_MS,
      externalRefreshIntervalMs: EXTERNAL_REFRESH_INTERVAL_MS,
    },
    setters: {
      setIsSaving,
      setIsSavePending: () => {},
      setSaveError,
      setHasSaveConflict,
      setIsExternalRefreshRunning: () => {},
      applyExternalSnapshot: (incomingProject, incomingScenes) => {
        const nextScenesById = Object.fromEntries(
          incomingScenes.map((scene) => [scene.id, scene]),
        );
        const currentSceneId = sceneRef.current?.id;
        const loadedScene =
          (currentSceneId ? nextScenesById[currentSceneId] : undefined) ??
          incomingScenes[0];
        if (!loadedScene) return;
        setProject(incomingProject);
        setScene(loadedScene);
        setScenesById(nextScenesById);
        setSelectedLayerIds([]);
        setActiveInsertionGroupId(null);
        setSelectedAnimationId(null);
        setInspectorScope("scene");
        documentVersions.markProjectChanged();
        documentVersions.markSceneChanged();
        markCurrentStateSaved();
        clearHistory();
      },
      onSceneSaved: (savedScene) => {
        setScenesById((current) => ({
          ...current,
          [savedScene.id]: savedScene,
        }));
      },
      onExternalError: (message) => setSceneError(message),
      markCurrentStateSaved,
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

  const loadAllFromDisk = useCallback(async (): Promise<void> => {
    const currentProject = projectRef.current;
    if (!currentProject) return;

    const loadedProject = await fetchProject(currentProject.id);
    const loadedScenes = await Promise.all(
      loadedProject.scenes.map((reference) =>
        fetchScene(loadedProject.id, reference.id),
      ),
    );
    const nextScenesById = Object.fromEntries(
      loadedScenes.map((candidate) => [candidate.id, candidate]),
    );
    const currentSceneId = sceneRef.current?.id;
    const loadedScene =
      (currentSceneId ? nextScenesById[currentSceneId] : undefined) ??
      loadedScenes[0];
    if (!loadedScene) throw new Error("Project contains no scenes");

    setProject(loadedProject);
    setScene(loadedScene);
    setScenesById(nextScenesById);
    setSelectedLayerIds([]);
    setActiveInsertionGroupId(null);
    setSelectedAnimationId(null);
    setInspectorScope("scene");
    documentVersions.markProjectChanged();
    documentVersions.markSceneChanged();
    markCurrentStateSaved();
    clearHistory();
  }, [clearHistory, documentVersions, markCurrentStateSaved]);

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
  }, [loadAllFromDisk, saveController]);

  const handleOverwriteExternalChanges = useCallback(() => {
    setHasSaveConflict(false);
    void queueCurrentSave(true).catch(() => undefined);
  }, [queueCurrentSave]);

  const handleSelectedLayerIdsChange = useCallback((layerIds: string[]) => {
    setSelectedLayerIds((currentLayerIds) =>
      hasSameLayerIds(currentLayerIds, layerIds) ? currentLayerIds : layerIds,
    );
    setSelectedAnimationId(null);
    setInspectorScope(layerIds.length > 0 ? "layer" : "scene");
    setActiveInsertionGroupId((current) => {
      if (!current || layerIds.length === 0) return null;
      const currentScene = sceneRef.current;
      const group = currentScene
        ? findLayerById(currentScene.layers, current)
        : null;
      if (!group || group.type !== "group") return null;
      return layerIds.every(
        (layerId) =>
          layerId === group.id ||
          group.children.some((child) => child.id === layerId),
      )
        ? current
        : null;
    });
  }, []);

  const handleGroupEditEnter = useCallback((groupId: string) => {
    const currentScene = sceneRef.current;
    const group = currentScene
      ? findLayerById(currentScene.layers, groupId)
      : null;
    if (!group || group.type !== "group" || group.locked) return;
    setActiveInsertionGroupId(groupId);
    setSelectedLayerIds([groupId]);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
  }, []);

  const handleLayerStateChange = useCallback(
    (
      sceneId: string,
      layerId: string,
      patch: { locked?: boolean; visible?: boolean },
    ) => {
      if (!scene || scene.id !== sceneId) {
        return;
      }

      const updatedScene = {
        ...scene,
        layers: updateLayerById(scene.layers, layerId, (layer) => ({
          ...layer,
          ...patch,
        } as Layer)),
      } as Scene;

      handleSceneChange(updatedScene);
      if (patch.locked && layerId === activeInsertionGroupId) {
        setActiveInsertionGroupId(null);
      }
    },
    [activeInsertionGroupId, handleSceneChange, scene],
  );

  const handleDeleteSelection = useCallback(async () => {
    if (!project || !scene || isSceneLoading) {
      return;
    }

    if (inspectorScope === "layer") {
      layerCommands.deleteSelection();
      return;
    }

    if (project.scenes.length <= 1) {
      setSceneError("A project must contain at least one scene");
      return;
    }

    recordHistory();
    setIsSceneLoading(true);
    setSceneError(null);

    try {
      await queueCurrentSave();
      const deletedIndex = project.scenes.findIndex(
        (reference) => reference.id === scene.id,
      );
      const nextProject = await deleteSceneRequest(project.id, scene.id);
      const nextReference =
        nextProject.scenes[Math.min(deletedIndex, nextProject.scenes.length - 1)];

      if (!nextReference) {
        throw new Error("Project contains no scenes");
      }

      const nextScene =
        scenesById[nextReference.id] ??
        (await fetchScene(nextProject.id, nextReference.id));

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
      documentVersions.markProjectChanged();
      documentVersions.markSceneChanged();
      markCurrentStateSaved();
    } catch (error: unknown) {
      historyController.stacks.undo.current.pop();
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }, [
    documentVersions,
    historyController.stacks.undo,
    inspectorScope,
    isSceneLoading,
    markCurrentStateSaved,
    project,
    queueCurrentSave,
    recordHistory,
    scene,
    scenesById,
    layerCommands,
  ]);

  const handleGroupSelection = useCallback(() => {
    layerCommands.groupSelection();
  }, [layerCommands]);

  const handleUngroupSelection = useCallback(() => {
    layerCommands.ungroupSelection();
  }, [layerCommands]);

  const handleDuplicateSelection = useCallback(() => {
    layerCommands.duplicateSelection();
  }, [layerCommands]);

  const handleCopySelection = useCallback(() => {
    layerCommands.copySelection();
  }, [layerCommands]);

  const handlePasteSelection = useCallback(() => {
    layerCommands.pasteSelection();
  }, [layerCommands]);

  const handleReorderSelection = useCallback(
    (action: ZOrderAction) => {
      layerCommands.reorderSelection(action);
    },
    [layerCommands],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "Escape") {
        setActiveInsertionGroupId(null);
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) void handleRedo();
        else void handleUndo();
        return;
      }

      if (event.ctrlKey && key === "y") {
        event.preventDefault();
        void handleRedo();
        return;
      }

      if (modifier && key === "g") {
        event.preventDefault();
        if (event.shiftKey) handleUngroupSelection();
        else handleGroupSelection();
        return;
      }

      if (modifier && key === "d") {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }

      if (modifier && key === "c") {
        if (inspectorScope === "layer") {
          event.preventDefault();
          handleCopySelection();
        }
        return;
      }

      if (modifier && key === "v") {
        event.preventDefault();
        handlePasteSelection();
        return;
      }

      if (modifier && (key === "[" || key === "]")) {
        event.preventDefault();
        const action: ZOrderAction =
          key === "]"
            ? event.shiftKey
              ? "front"
              : "forward"
            : event.shiftKey
              ? "back"
              : "backward";
        handleReorderSelection(action);
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;

      event.preventDefault();
      void handleDeleteSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleCopySelection,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleGroupSelection,
    handlePasteSelection,
    handleRedo,
    handleReorderSelection,
    handleUndo,
    handleUngroupSelection,
    inspectorScope,
  ]);

  const handleAlign = useCallback(
    (action: AlignmentAction) => {
      layerCommands.align(action);
    },
    [layerCommands],
  );

  function handleAddLayer(type: AddableLayerType): void {
    layerCommands.addLayer(type);
  }

  function handleAddImage(): void {
    layerCommands.addImagePlaceholder();
  }

  const handleImageFileChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      const initialScene = sceneRef.current;
      if (!file || !project || !initialScene) {
        return;
      }

      if (sceneOperationRunningRef.current || isApplyingHistoryRef.current) {
        setImageUploadError("Wait for the current scene operation to finish");
        return;
      }

      setIsUploadingImage(true);
      setImageUploadError(null);
      setSceneError(null);
      const replaceTargetId = replaceImageTargetIdRef.current;
      replaceImageTargetIdRef.current = null;
      try {
        if (!replaceTargetId) {
          throw new Error("Select an image placeholder before loading an image");
        }
        const target = findLayerById(initialScene.layers, replaceTargetId);
        if (!target || target.type !== "image") {
          setImageUploadError("The selected layer is no longer an image");
          return;
        }
        const asset = await uploadImageAsset(project.id, file, file.name);
        const latestScene = sceneRef.current;
        if (sceneOperationRunningRef.current || isApplyingHistoryRef.current) {
          setImageUploadError("The scene changed before the image finished uploading");
          return;
        }
        if (!latestScene || latestScene.id !== initialScene.id) {
          setImageUploadError("The scene changed before the image finished uploading");
          return;
        }
        const updatedLayers = updateLayerById(
          latestScene.layers,
          replaceTargetId,
          (layer) => {
            if (layer.type !== "image") {
              return layer;
            }
            return {
              ...layer,
              src: asset.src,
            };
          },
        );
        handleSceneChange({ ...latestScene, layers: updatedLayers });
      } catch (error: unknown) {
        setImageUploadError(getErrorMessage(error));
        setSceneError(getErrorMessage(error));
      } finally {
        setIsUploadingImage(false);
      }
    },
    [handleSceneChange, project],
  );

  const handleReplaceImage = useCallback(() => {
    if (
      !project ||
      !scene ||
      isUploadingImage ||
      !selectedLayerId ||
      sceneOperationRunningRef.current ||
      isApplyingHistoryRef.current
    ) {
      return;
    }
    replaceImageTargetIdRef.current = selectedLayerId;
    imageFileInputRef.current?.click();
  }, [isUploadingImage, project, scene, selectedLayerId]);

  const handleSelectedLayerPatch = useCallback(
    (patch: EditableLayerPatch) => {
      if (!scene || !selectedLayerId) {
        return;
      }
      const selected = findLayerById(scene.layers, selectedLayerId);
      const parentGroup = findParentGroup(scene.layers, selectedLayerId);
      if (!selected || selected.locked || parentGroup?.locked) return;

      const patchKeys = Object.keys(patch);

      if (patchKeys.length === 0) {
        return;
      }

      let changed = false;
      const updatedLayers = updateLayerById(scene.layers, selectedLayerId, (layer) => {
        const layerRecord = layer as unknown as Record<string, unknown>;
        const patchRecord = patch as Record<string, unknown>;
        const hasChanged = patchKeys.some(
          (key) => layerRecord[key] !== patchRecord[key],
        );

        if (!hasChanged) {
          return layer;
        }

        changed = true;

        if (layer.type === "group" && ("width" in patch || "height" in patch)) {
          const targetWidth = patch.width ?? layer.width;
          const targetHeight = patch.height ?? layer.height;
          const scaleX = layer.width > 0 ? targetWidth / layer.width : 1;
          const scaleY = layer.height > 0 ? targetHeight / layer.height : 1;
          const rescaled = scaleGroupChildren(
            { ...layer, width: layer.width, height: layer.height },
            scaleX,
            scaleY,
          );
          const centerX = layer.x + layer.width / 2;
          const centerY = layer.y + layer.height / 2;
          return {
            ...rescaled,
            x: roundCoordinate(centerX - rescaled.width / 2),
            y: roundCoordinate(centerY - rescaled.height / 2),
          };
        }

        if (layer.type === "text") {
          const merged: Layer = { ...layer, ...patch } as Layer;
          if (merged.type !== "text") return merged;
          const typographyChanged = patchKeys.some((key) =>
            [
              "text",
              "fontFamily",
              "fontSize",
              "fontWeight",
              "fontStyle",
              "lineHeight",
              "letterSpacing",
              "textCase",
              "autoResize",
            ].includes(key),
          );

          let nextWidth = merged.width;
          let nextHeight = merged.height;

          if (typographyChanged) {
            const measured = computeTextBoxSize(merged);
            nextWidth = measured.width;
            nextHeight = measured.height;
          }

          const widthDelta = nextWidth - layer.width;
          const heightDelta = nextHeight - layer.height;
          return {
            ...merged,
            width: nextWidth,
            height: nextHeight,
            x: layer.x - widthDelta / 2,
            y: layer.y - heightDelta / 2,
          } as Layer;
        }

        const merged = {
          ...layer,
          ...patch,
        } as Layer;
        return !isLineDrawEligible(merged) &&
          merged.animations.some((animation) => animation.preset === "line-draw")
          ? {
              ...merged,
              animations: merged.animations.filter(
                (animation) => animation.preset !== "line-draw",
              ),
            }
          : merged;
      });

      if (!changed) {
        return;
      }

      handleSceneChange({
        ...scene,
        layers: updatedLayers,
      });
    },
    [handleSceneChange, scene, selectedLayerId],
  );

  const handleLayerAnimationsChange = useCallback(
    (layerId: string, animations: LayerAnimation[]) => {
      if (!scene) {
        return;
      }
      const selected = findLayerById(scene.layers, layerId);
      const parentGroup = findParentGroup(scene.layers, layerId);
      if (!selected || selected.locked || parentGroup) return;

      let changed = false;
      const updatedLayers = updateLayerById(scene.layers, layerId, (layer) => {
        const isSame =
          JSON.stringify(layer.animations) === JSON.stringify(animations);

        if (isSame) {
          return layer;
        }

        changed = true;

        return {
          ...layer,
          animations,
        };
      });

      if (!changed) {
        return;
      }

      handleSceneChange({
        ...scene,
        layers: updatedLayers,
      });
    },
    [handleSceneChange, scene],
  );

  const handleSelectedLayerAnimationsChange = useCallback(
    (animations: LayerAnimation[]) => {
      if (selectedLayerId) {
        handleLayerAnimationsChange(selectedLayerId, animations);
      }
    },
    [handleLayerAnimationsChange, selectedLayerId],
  );

  const handleTextLayerChange = useCallback(
    (
      layerId: string,
      text: string,
      width: number,
      height: number,
    ): void => {
      if (!scene) {
        return;
      }
      const target = findLayerById(scene.layers, layerId);
       const parentGroup = findParentGroup(scene.layers, layerId);
       if (
         !target ||
         (target.type !== "text" &&
           target.type !== "rectangle" &&
           target.type !== "circle") ||
         target.locked ||
         parentGroup?.locked
       ) {
         return;
       }
       if (target.type !== "text") {
         if (target.type === "circle" && (target.donut !== 0 || target.sweep !== 360)) {
           return;
         }
         if (target.shapeText.text === text) return;
         const updatedLayers = updateLayerById(scene.layers, layerId, (layer) =>
           layer.type === "rectangle" || layer.type === "circle"
             ? { ...layer, shapeText: { ...layer.shapeText, text } }
             : layer,
         );
         handleSceneChange({ ...scene, layers: updatedLayers });
         return;
       }
      const nextWidth = Math.max(1, Math.ceil(width));
      const nextHeight = Math.max(1, Math.ceil(height));
      if (
        target.text === text &&
        Math.abs(target.width - nextWidth) < 0.5 &&
        Math.abs(target.height - nextHeight) < 0.5
      ) {
        return;
      }
      const updatedLayers = updateLayerById(scene.layers, layerId, (layer) => {
        if (layer.type !== "text") {
          return layer;
        }
        const widthDelta = nextWidth - layer.width;
        const heightDelta = nextHeight - layer.height;
        return {
          ...layer,
          text,
          width: nextWidth,
          height: nextHeight,
          x: layer.x - widthDelta / 2,
          y: layer.y - heightDelta / 2,
        };
      });
      handleSceneChange({
        ...scene,
        layers: updatedLayers,
      });
    },
    [handleSceneChange, scene],
  );

  const handleAnimationTimingChange = useCallback(
    (
      layerId: string,
      animationId: string,
      patch: Pick<LayerAnimation, "startFrame" | "durationInFrames">,
    ) => {
      const layer = scene ? findLayerById(scene.layers, layerId) : null;
      if (!layer) return;

      handleLayerAnimationsChange(
        layerId,
        layer.animations.map((animation) =>
          animation.id === animationId ? { ...animation, ...patch } : animation,
        ),
      );
    },
    [handleLayerAnimationsChange, scene],
  );

  const handleMagicMoveTranslationCommit = useCallback(
    (
      layerId: string,
      animationId: string,
      translateX: number,
      translateY: number,
    ) => {
      const layer = scene ? findLayerById(scene.layers, layerId) : null;
      if (!layer) return;
      handleLayerAnimationsChange(
        layerId,
        layer.animations.map((animation) =>
          animation.id === animationId && animation.preset === "magic-move"
            ? { ...animation, translateX, translateY }
            : animation,
        ),
      );
    },
    [handleLayerAnimationsChange, scene],
  );

  const handleAnimationSelect = useCallback(
    (layerId: string, animationId: string) => {
      const currentScene = sceneRef.current;
      if (currentScene && findParentGroup(currentScene.layers, layerId)) return;
      setActiveInsertionGroupId(null);
      setSelectedLayerIds([layerId]);
      setSelectedAnimationId(animationId);
      setInspectorScope("layer");
      setInspectorTab("animate");
    },
    [],
  );

  async function handleSceneSelect(
    sceneId: string,
    nextSelectedLayerIds: string[] = [],
    nextScope: InspectorScope = "scene",
  ): Promise<boolean> {
    if (!project) {
      return false;
    }

    if (sceneId === scene?.id) {
      setActiveInsertionGroupId(null);
      setSelectedLayerIds(nextSelectedLayerIds);
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      return true;
    }

    if (isSceneLoading || hasSaveConflict) {
      return false;
    }

    setIsSceneLoading(true);
    setSceneError(null);

    try {
      await queueCurrentSave();
      const loadedScene = await fetchScene(project.id, sceneId);

      setScene(loadedScene);
      setScenesById((current) => ({
        ...current,
        [loadedScene.id]: loadedScene,
      }));
      setSelectedLayerIds(nextSelectedLayerIds);
      setActiveInsertionGroupId(null);
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      documentVersions.markSceneChanged();
      markCurrentStateSaved();
      clearHistory();
      return true;
    } catch (error: unknown) {
      setSceneError(getErrorMessage(error));
      return false;
    } finally {
      setIsSceneLoading(false);
    }
  }

  function handleTreeGroupEditEnter(sceneId: string, groupId: string): void {
    if (sceneId === scene?.id) {
      handleGroupEditEnter(groupId);
      return;
    }
    void handleSceneSelect(sceneId, [groupId], "layer").then((didSelect) => {
      if (didSelect) setActiveInsertionGroupId(groupId);
    });
  }

  function handleTreeLayerSelect(
    sceneId: string,
    layerId: string,
    additive: boolean,
  ): void {
    if (sceneId !== scene?.id) {
      void handleSceneSelect(sceneId, [layerId], "layer");
      return;
    }

    const clickedLayer = findLayerById(scene.layers, layerId);
    const parentGroup = findParentGroup(scene.layers, layerId);
    if (!clickedLayer || clickedLayer.locked || parentGroup?.locked) return;

    setSelectedAnimationId(null);

    setActiveInsertionGroupId((current) => {
      if (!current) return null;
      const group = findLayerById(scene.layers, current);
      if (!group || group.type !== "group") return null;
      return layerId === group.id ||
        group.children.some((child) => child.id === layerId)
        ? current
        : null;
    });

    setSelectedLayerIds((currentLayerIds) => {
      if (!additive) {
        return currentLayerIds.length === 1 && currentLayerIds[0] === layerId
          ? currentLayerIds
          : [layerId];
      }

      if (currentLayerIds.includes(layerId)) {
        return currentLayerIds.filter((candidate) => candidate !== layerId);
      }
      const normalized = clickedLayer.type === "group"
        ? currentLayerIds.filter(
            (candidate) =>
              !clickedLayer.children.some((child) => child.id === candidate),
          )
        : currentLayerIds.filter((candidate) => candidate !== parentGroup?.id);
      return [...normalized, layerId];
    });
    setInspectorScope("layer");
  }

  function handleTreeLayerMove(
    sceneId: string,
    request: LayerMoveRequest,
  ): void {
    if (!scene || scene.id !== sceneId) return;
    const updatedScene = moveLayerTo(scene, request.layerId, {
      parentGroupId: request.parentGroupId,
      beforeLayerId: request.beforeLayerId,
    });
    if (!updatedScene) {
      setSceneError("This layer cannot be moved to that position");
      return;
    }
    if (JSON.stringify(updatedScene.layers) === JSON.stringify(scene.layers)) {
      return;
    }
    handleSceneChange(updatedScene);
    setSelectedLayerIds([request.layerId]);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    setSceneError(null);
    setActiveInsertionGroupId((current) =>
      current && request.parentGroupId === current ? current : null,
    );
  }

  async function handleAddScene(): Promise<void> {
    if (!project || isCreatingScene) {
      return;
    }

    setIsCreatingScene(true);
    setCreateSceneError(null);
    setSceneError(null);

    recordHistory();
    try {
      await queueCurrentSave();
      const { project: nextProject, scene: newScene } = await createScene(
        project.id,
      );

      setProject(nextProject);
      setScene(newScene);
      setScenesById((current) => ({
        ...current,
        [newScene.id]: newScene,
      }));
      setSelectedLayerIds([]);
      setInspectorScope("scene");
      documentVersions.markProjectChanged();
      documentVersions.markSceneChanged();
      markCurrentStateSaved();
    } catch (error: unknown) {
      historyController.stacks.undo.current.pop();
      setCreateSceneError(getErrorMessage(error));
    } finally {
      setIsCreatingScene(false);
    }
  }

  const handleTogglePreview = useCallback(() => {
    setIsPreviewMode((current) => !current);
  }, []);

  const handlePreviewSeek = useCallback((frame: number) => {
    const sceneStartFrame = sceneRef.current?.startFrame ?? 0;
    previewPlayerRef.current?.seekTo(sceneStartFrame + frame);
  }, []);

  const handleOpenPreviewWindow = useCallback(() => {
    const existingPreview = previewWindowRef.current;

    if (existingPreview && !existingPreview.closed) {
      existingPreview.focus();

      if (previewStateRef.current) {
        previewChannelRef.current?.postMessage(previewStateRef.current);
      }

      return;
    }

    const previewWindow = window.open(
      "/preview",
      "ai-broll-preview",
      "popup=yes,width=960,height=600,resizable=yes",
    );

    previewWindowRef.current = previewWindow;
    previewWindow?.focus();
  }, []);

  const isPreviewModeRef = useRef(false);
  isPreviewModeRef.current = isPreviewMode;

  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || isPreviewModeRef.current) {
        return;
      }
      event.preventDefault();
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * 100
            : event.deltaY;
      canvasCursorRef.current = { x: event.clientX, y: event.clientY };
      setCanvasZoom((current) =>
        clampCanvasZoom(current * Math.exp(-delta / 150)),
      );
    };

    area.addEventListener("wheel", handleWheel, { passive: false });
    return () => area.removeEventListener("wheel", handleWheel);
  }, [project, scene]);

  const selectedLayer: Layer | null = scene && selectedLayerId
    ? findLayerById(scene.layers, selectedLayerId)
    : null;
  const selectedLayerParentGroup = scene && selectedLayerId
    ? findParentGroup(scene.layers, selectedLayerId) ?? null
    : null;
  const selectedTopLevelLayers = scene
    ? scene.layers.filter((layer) => selectedLayerIds.includes(layer.id))
    : [];
  const canGroup =
    selectedLayerIds.length >= 2 &&
    selectedTopLevelLayers.length === selectedLayerIds.length &&
    selectedTopLevelLayers.every(
      (layer) => layer.type !== "group" && !layer.locked,
    );
  const canUngroup =
    selectedLayer?.type === "group" && canFlattenGroup(selectedLayer, true);
  const isGroupSelected = selectedLayer?.type === "group";
  const canOpenLayerContextMenu = selectedLayerIds.length > 0;

  const openLayerContextMenu = (x: number, y: number): void => {
    if (canOpenLayerContextMenu) setContextMenu({ x, y });
  };

  if (loadError) {
    return (
      <main className="status-page">
        <h1>AI-Broll-Assistant</h1>
        <p>Failed to load project: {loadError}</p>
      </main>
    );
  }

  if (!project || !scene) {
    return (
      <main className="status-page">
        <div className="loading-mark" />
        <p>Loading project...</p>
      </main>
    );
  }

  const scenesForTree: Record<string, Scene> = {
    ...scenesById,
    [scene.id]: scene,
  };
  const sceneNumber =
    project.scenes.findIndex((reference) => reference.id === scene.id) + 1;
  const currentSceneIndex =
    project.scenes.findIndex((reference) => reference.id === scene.id);
  const nextSceneReference = project.scenes[currentSceneIndex + 1];
  const nextScene = nextSceneReference
    ? scenesById[nextSceneReference.id]
    : null;
  const maximumDurationInFrames = nextScene
    ? nextScene.startFrame - scene.startFrame
    : Number.POSITIVE_INFINITY;
  const saveStatus = isSaving
    ? "Saving automatically…"
    : hasSaveConflict
      ? "Save conflict"
      : saveError
        ? "Save failed"
    : isDirty
      ? "Waiting to save…"
      : "All changes saved";

  return (
    <main
      className="editor-app"
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        if (!canOpenLayerContextMenu) return;
        if (
          !(event.target instanceof Element) ||
          !event.target.closest(".canvas-workspace, .layer-item")
        ) return;
        event.preventDefault();
        openLayerContextMenu(event.clientX, event.clientY);
      }}
    >
      <header className="topbar">
        <div className="project-context">
          <div className="app-logo">B</div>
          <div>
            <h1>{project.name}</h1>
            <p>
              {scene.topic} · {project.width} × {project.height} · {project.fps}{" "}
              fps
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          {sceneError ? (
            <span className="toolbar-error">Scene error: {sceneError}</span>
          ) : null}
          {saveError && !hasSaveConflict ? (
            <span className="save-conflict-actions">
              <span className="toolbar-error">Save failed: {saveError}</span>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void queueCurrentSave().catch(() => undefined)}
              >
                Retry
              </button>
            </span>
          ) : null}
          {hasSaveConflict ? (
            <span className="save-conflict-actions">
              <span className="toolbar-error">File changed outside the editor.</span>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void handleReloadExternalChanges()}
              >
                Use disk
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={handleOverwriteExternalChanges}
              >
                Keep mine
              </button>
            </span>
          ) : null}
          {createSceneError ? (
            <span className="toolbar-error">{createSceneError}</span>
          ) : null}
          {imageUploadError ? (
            <span className="toolbar-error">
              Image upload failed: {imageUploadError}
            </span>
          ) : null}
          <span className={`save-status${isDirty ? " is-dirty" : ""}`}>
            <span className="status-dot" />
            {saveStatus}
          </span>
          <EditorToolbar
            isAddSceneDisabled={
              !project || isSceneLoading || isCreatingScene || hasSaveConflict
            }
            isCreatingScene={isCreatingScene}
            canUndo={historyCanUndo}
            canRedo={historyCanRedo}
            isPreviewActive={isPreviewMode}
            onUndo={() => void handleUndo()}
            onRedo={() => void handleRedo()}
            onTogglePreview={handleTogglePreview}
            onOpenPreviewWindow={handleOpenPreviewWindow}
            onAddText={() => handleAddLayer("text")}
            onAddImage={handleAddImage}
            onAddRectangle={() => handleAddLayer("rectangle")}
            onAddCircle={() => handleAddLayer("circle")}
            onAddTriangle={() => handleAddLayer("triangle")}
            onAddArrow={() => handleAddLayer("arrow")}
            onAddScene={() => void handleAddScene()}
          />
        </div>
        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden-image-input"
          onChange={(event) => void handleImageFileChange(event)}
        />
      </header>

      <div className="editor-workspace">
        <aside className="sidebar sidebar-left">
          <SceneLayerTree
            sceneReferences={project.scenes}
            scenesById={scenesForTree}
            currentSceneId={scene.id}
            selectedLayerIds={selectedLayerIds}
            hoveredLayerId={hoveredLayerId}
            activeInsertionGroupId={activeInsertionGroupId}
            inspectorScope={inspectorScope}
            isSceneSwitchDisabled={
              isSceneLoading || isCreatingScene || hasSaveConflict
            }
            onSceneSelect={(sceneId) => void handleSceneSelect(sceneId)}
            onLayerSelect={handleTreeLayerSelect}
            onGroupEditEnter={handleTreeGroupEditEnter}
            onLayerMove={handleTreeLayerMove}
            onLayerStateChange={handleLayerStateChange}
          />
        </aside>

        <section
          className={`canvas-workspace${isTimelineResizing ? " is-resizing" : ""}`}
          aria-label="Fabric editor"
          style={{
            gridTemplateRows: `minmax(0, 1fr) 7px ${timelineHeight}px`,
          }}
        >
          <div className="canvas-editor-area" ref={canvasAreaRef}>
            <div className="canvas-stage">
              <div className={`canvas-frame${isPreviewMode ? " is-preview" : ""}`}>
                {isPreviewMode ? (
                  <RemotionScenePlayer
                    key={scene.id}
                    scene={scene}
                    projectId={project.id}
                    audioFile={project.audioFile}
                    projectWidth={project.width}
                    projectHeight={project.height}
                    fps={project.fps}
                    displayScale={0.5}
                    playerRef={previewPlayerRef}
                  />
                ) : (
                  <FabricSceneCanvas
                    scene={scene}
                    projectId={project.id}
                    projectWidth={project.width}
                    projectHeight={project.height}
                    displayScale={BASE_CANVAS_SCALE}
                    zoom={canvasZoom}
                    zoomCursorRef={canvasCursorRef}
                    onSceneChange={handleSceneChange}
                    onSelectedLayerIdsChange={handleSelectedLayerIdsChange}
                    onHoveredLayerIdChange={setHoveredLayerId}
                    onGroupEditEnter={handleGroupEditEnter}
                    onContextMenuRequest={openLayerContextMenu}
                    selectedLayerIds={selectedLayerIds}
                    selectedAnimationId={
                      inspectorTab === "animate" ? selectedAnimationId : null
                    }
                    onMagicMoveTranslationCommit={
                      handleMagicMoveTranslationCommit
                    }
                    pendingTextEditLayerId={pendingTextEditLayerId}
                    onPendingTextEditConsumed={() => setPendingTextEditLayerId(null)}
                    onTextLayerChange={handleTextLayerChange}
                  />
                )}
                {isPreviewMode ? (
                  <span className="preview-mode-badge">Preview</span>
                ) : null}
              </div>
            </div>
            {!isPreviewMode ? (
              <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom">
                <button
                  type="button"
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => zoomCanvasBy(-ZOOM_STEP)}
                >
                  −
                </button>
                <span>{Math.round(BASE_CANVAS_SCALE * canvasZoom * 100)}%</span>
                <button
                  type="button"
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => zoomCanvasBy(ZOOM_STEP)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="canvas-zoom-fit"
                  title="Reset zoom to fit"
                  onClick={resetCanvasZoom}
                >
                  Fit
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            role="separator"
            aria-label="Resize scene timing"
            aria-orientation="horizontal"
            aria-valuemin={MIN_TIMELINE_HEIGHT}
            aria-valuemax={1000}
            aria-valuenow={Math.round(timelineHeight)}
            className="timeline-resize-handle"
            onDoubleClick={() => setTimelineHeight(DEFAULT_TIMELINE_HEIGHT)}
            onKeyDown={handleTimelineResizeKeyDown}
            onPointerDown={handleTimelineResizeStart}
            onPointerMove={handleTimelineResizeMove}
            onPointerUp={handleTimelineResizeEnd}
            onPointerCancel={handleTimelineResizeEnd}
          >
            <span />
          </button>
          <SceneAnimationTimeline
            scene={scene}
            fps={project.fps}
            selectedLayerId={selectedLayerId}
            selectedAnimationId={selectedAnimationId}
            isPreviewMode={isPreviewMode}
            playerRef={previewPlayerRef}
            onSeek={handlePreviewSeek}
            onAnimationSelect={handleAnimationSelect}
            onAnimationTimingChange={handleAnimationTimingChange}
          />
        </section>

        <aside className="sidebar sidebar-right">
          <div className="inspector-tabs" role="tablist" aria-label="Inspector">
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === "design"}
              className={inspectorTab === "design" ? "is-active" : ""}
              onClick={() => setInspectorTab("design")}
            >
              Design
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === "animate"}
              className={inspectorTab === "animate" ? "is-active" : ""}
              onClick={() => setInspectorTab("animate")}
            >
              Animate
            </button>
          </div>

          <div className="inspector-scroll">
            {inspectorTab === "design" ? (
              inspectorScope === "scene" ? (
                <ScenePropertiesPanel
                  key={scene.id}
                  scene={scene}
                  project={project}
                  sceneNumber={sceneNumber}
                  maximumDurationInFrames={maximumDurationInFrames}
                  onProjectChange={handleProjectChange}
                  onSceneChange={handleSceneChange}
                />
              ) : selectedLayerIds.length > 1 ? (
                <MultiLayerPropertiesPanel
                  selectionCount={selectedLayerIds.length}
                  canGroup={canGroup}
                  onAlign={handleAlign}
                  onGroup={handleGroupSelection}
                  onDuplicate={handleDuplicateSelection}
                  onReorder={handleReorderSelection}
                />
              ) : (
                <LayerPropertiesPanel
                  layer={selectedLayer}
                  onPatch={handleSelectedLayerPatch}
                  onAlign={handleAlign}
                  onReplaceImage={handleReplaceImage}
                  onDuplicate={handleDuplicateSelection}
                  onReorder={handleReorderSelection}
                  onDeleteLayer={() => void handleDeleteSelection()}
                />
              )
            ) : (
               <LayerAnimationPanel
                 layer={selectedLayerIds.length === 1 ? selectedLayer : null}
                 readOnlyReason={
                   selectedLayerParentGroup
                     ? "Group members inherit animation from their top-level group."
                     : null
                 }
                fps={project.fps}
                sceneDurationInFrames={scene.durationInFrames}
                selectedAnimationId={selectedAnimationId}
                onAnimationSelect={setSelectedAnimationId}
                onAnimationsChange={handleSelectedLayerAnimationsChange}
              />
            )}
          </div>
        </aside>
      </div>
      {contextMenu ? (
        <div
          className="layer-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {!isGroupSelected ? (
            <button type="button" role="menuitem" disabled={!canGroup} onClick={handleGroupSelection}>
              <span>Group</span><kbd>⌘G</kbd>
            </button>
          ) : null}
          {isGroupSelected ? (
            <button type="button" role="menuitem" disabled={!canUngroup} onClick={handleUngroupSelection}>
              <span>Ungroup</span><kbd>⇧⌘G</kbd>
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={handleDuplicateSelection}>
            <span>Duplicate</span><kbd>⌘D</kbd>
          </button>
          <button type="button" role="menuitem" onClick={handleCopySelection}>
            <span>Copy</span><kbd>⌘C</kbd>
          </button>
          <button type="button" role="menuitem" onClick={handlePasteSelection}>
            <span>Paste</span><kbd>⌘V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => handleReorderSelection("back")}>
            <span>Send to back</span><kbd>⇧⌘[</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => handleReorderSelection("backward")}>
            <span>Send backward</span><kbd>⌘[</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => handleReorderSelection("forward")}>
            <span>Bring forward</span><kbd>⌘]</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => handleReorderSelection("front")}>
            <span>Bring to front</span><kbd>⇧⌘]</kbd>
          </button>
        </div>
      ) : null}
    </main>
  );
}

export default App;
