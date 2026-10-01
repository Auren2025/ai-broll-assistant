import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
} from "react";
import type { PlayerRef } from "@remotion/player";
import "./App.css";
import {
  uploadImageAsset,
  fetchSubtitles,
} from "./api/projectApi";
import type { SubtitleCue } from "./domain/subtitleCueSchema";
import { sceneStartFrame as sceneStartFrameForProject } from "./domain/scenePlacement";
import type { Layer, Scene } from "./domain/sceneSchema";
import {
  canFlattenGroup,
  findLayerById,
  moveLayerTo,
  updateLayerById,
  type ZOrderAction,
} from "./domain/groupOperations";
import { type AlignmentAction } from "./editor/alignment";
import { EditorToolbar } from "./editor/EditorToolbar";
import { EditorInspector } from "./editor/EditorInspector";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { RemotionScenePlayer } from "./remotion/RemotionScenePlayer";
import { SceneAnimationTimeline } from "./editor/SceneAnimationTimeline";
import { useLayerEdits } from "./editor/useLayerEdits";
import { useEditorSelection, type InspectorScope } from "./editor/useEditorSelection";
import { useEditorDocument } from "./editor/useEditorDocument";
import { useImageCrop } from "./editor/useImageCrop";
import {
  SceneLayerTree,
  type LayerMoveRequest,
} from "./editor/SceneLayerTree";
import { usePreviewWindow } from "./preview/usePreviewWindow";
import { BASE_CANVAS_SCALE, ZOOM_STEP, useCanvasZoom } from "./editor/useCanvasZoom";
import { MIN_TIMELINE_HEIGHT, useTimelineResize } from "./editor/useTimelineResize";

import { useLayerCommands, type AddableLayerType } from "./editor/layerCommands";

type InspectorTab = "design" | "animate";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function findParentGroup(layers: readonly Layer[], layerId: string) {
  return layers.find(
    (layer) =>
      layer.type === "group" &&
      layer.children.some((child) => child.id === layerId),
  );
}

function App() {
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [activeInsertionGroupId, setActiveInsertionGroupId] = useState<
    string | null
  >(null);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(
    null,
  );
  const timelineResize = useTimelineResize();
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [inspectorScope, setInspectorScope] = useState<InspectorScope>("scene");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [slideMenu, setSlideMenu] = useState<{ sceneId: string; x: number; y: number } | null>(null);
  const [pendingTextEditLayerId, setPendingTextEditLayerId] = useState<
    string | null
  >(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const document = useEditorDocument({
    setSelectedLayerIds,
    setActiveInsertionGroupId,
    setSelectedAnimationId,
    setInspectorScope,
    setSlideMenu,
    getErrorMessage,
    selectedLayerIds,
    inspectorScope,
  });
  const {
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
    sceneOperationRunning,
    isApplyingHistory,
    isDocumentBusy,
    handleSceneChange,
    handleProjectChange,
    handleUndo,
    handleRedo,
    queueCurrentSave,
    handleReloadExternalChanges,
    handleOverwriteExternalChanges,
    sceneOperations,
  } = document;

  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasZoom = useCanvasZoom(canvasAreaRef, canvasElementRef, isPreviewMode, Boolean(project && scene));
  const handleOpenPreviewWindow = usePreviewWindow(project, scene, isDirty);
  const previewPlayerRef = useRef<PlayerRef | null>(null);
  const clipboardLayersRef = useRef<Layer[] | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const replaceImageTargetIdRef = useRef<string | null>(null);
  const splitNoticeTimeoutRef = useRef<number | null>(null);
  const selectedLayerId =
    selectedLayerIds.length === 1 ? (selectedLayerIds[0] ?? null) : null;

  // If the drilled group disappears, stops being a group, or gets locked
  // (e.g. after undo, delete, or a scene switch), leave drill mode.
  // Adjusted during render rather than in an effect so the canvas never
  // commits a frame with a stale drill scope.
  const [prevDrillValidationScene, setPrevDrillValidationScene] = useState(scene);
  if (prevDrillValidationScene !== scene) {
    setPrevDrillValidationScene(scene);
    setActiveInsertionGroupId((current) => {
      if (!current || !scene) return null;
      const group = findLayerById(scene.layers, current);
      return group?.type === "group" && !group.locked ? current : null;
    });
  }

  const layerCommands = useLayerCommands({
    state: {
      selection: {
        scene,
        selectedLayerIds,
        inspectorScope,
        activeInsertionGroupId,
      },
      project,
      allScenes: scene
        ? Object.values({ ...scenesById, [scene.id]: scene })
        : Object.values(scenesById),
      isUploadingImage,
      sceneOperationRunning,
      isApplyingHistory,
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
      setHasClipboard,
    },
    handlers: {
      handleSceneChange,
      handleProjectChange,
      getErrorMessage,
    },
  });

  // Subtitles only exist for B-roll projects (source.srt). They are loaded
  // once per project and drive the subtitle track on the scene timeline.
  const subtitleProjectId = project?.kind === "broll" ? project.id : null;
  useEffect(() => {
    if (!subtitleProjectId) {
      setSubtitleCues([]);
      return;
    }
    let cancelled = false;
    fetchSubtitles(subtitleProjectId)
      .then((cues) => {
        if (!cancelled) setSubtitleCues(cues);
      })
      .catch(() => {
        if (!cancelled) setSubtitleCues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subtitleProjectId]);

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

  const handleLayerRename = useCallback(
    (sceneId: string, layerId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !scene || scene.id !== sceneId) {
        return;
      }
      const updatedScene = {
        ...scene,
        layers: updateLayerById(scene.layers, layerId, (layer) => ({
          ...layer,
          name: trimmed,
        } as Layer)),
      } as Scene;
      handleSceneChange(updatedScene);
    },
    [handleSceneChange, scene],
  );

  const handleDeleteSelection = useCallback(async () => {
    if (!project || !scene || isSceneLoading) return;
    if (inspectorScope === "layer") layerCommands.deleteSelection();
    else await sceneOperations.deleteScene();
  }, [project, scene, isSceneLoading, inspectorScope, layerCommands, sceneOperations]);

  const handleSceneRename = useCallback(async (sceneId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !project || isSceneLoading || hasSaveConflict) return;
    // Renames flow through the current-scene edit path so history and
    // autosave keep working: select the target scene first when needed.
    let target = scene?.id === sceneId ? scene : null;
    if (!target) {
      const loaded = await sceneOperations.selectScene(sceneId);
      if (!loaded) return;
      target = loaded;
    }
    if (target.name !== trimmed) {
      handleSceneChange({ ...target, name: trimmed });
    }
  }, [project, scene, isSceneLoading, hasSaveConflict, sceneOperations, handleSceneChange]);

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

  const layerEdits = useLayerEdits(scene, selectedLayerId, handleSceneChange);

  // Image crop mode (canvas-only interaction state). Entered by
  // double-clicking an image or the inspector button; exited by Escape,
  // double-click, the Done button, scene switch, or selecting away.
  const {
    croppingLayerId,
    enterImageCrop,
    exitImageCrop,
    commitImageCrop,
  } = useImageCrop({
    scene,
    activeInsertionGroupId,
    selectedLayerIds,
    layerEdits,
    setSelectedLayerIds,
    setSelectedAnimationId,
    setInspectorScope,
  });

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
        // Keynote: Esc exits group editing and deselects everything.
        if (activeInsertionGroupId !== null) {
          setSelectedLayerIds([]);
        }
        setActiveInsertionGroupId(null);
        setSlideMenu(null);
        exitImageCrop();
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
    activeInsertionGroupId,
    exitImageCrop,
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

      if (isDocumentBusy()) {
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
        if (isDocumentBusy()) {
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
    [handleSceneChange, project, isDocumentBusy, sceneRef, setSceneError],
  );

  const handleReplaceImage = useCallback(() => {
    if (
      !project ||
      !scene ||
      isUploadingImage ||
      !selectedLayerId ||
      isDocumentBusy()
    ) {
      return;
    }
    replaceImageTargetIdRef.current = selectedLayerId;
    imageFileInputRef.current?.click();
  }, [isDocumentBusy, isUploadingImage, project, scene, selectedLayerId]);

  const selection = useEditorSelection({
    scene, sceneRef, setSelectedLayerIds, setActiveInsertionGroupId,
    setSelectedAnimationId, setInspectorScope, setInspectorTab,
    selectScene: sceneOperations.selectScene,
  });

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

  async function handleSlideContextMenu(sceneId: string, x: number, y: number): Promise<void> {
    if (project?.kind !== "slide" || isCreatingScene || isSceneLoading || hasSaveConflict) return;
    setContextMenu(null);
    setSlideMenu(null);
    if (!await sceneOperations.selectScene(sceneId)) return;
    setSlideMenu({
      sceneId,
      x: Math.max(8, Math.min(x, window.innerWidth - 206)),
      y: Math.max(8, Math.min(y, window.innerHeight - 104)),
    });
  }

  const handleTogglePreview = useCallback(() => {
    // Drill-in cannot survive the canvas unmount; exit it when previewing.
    setActiveInsertionGroupId(null);
    setIsPreviewMode((current) => !current);
  }, []);

  const handlePreviewSeek = useCallback((frame: number) => {
    const currentProject = projectRef.current;
    const currentScene = sceneRef.current;
    const sceneStartFrame = currentProject && currentScene
      ? sceneStartFrameForProject(currentProject, currentScene)
      : 0;
    previewPlayerRef.current?.seekTo(sceneStartFrame + frame);
  }, [projectRef, sceneRef]);

  const handleSplitScene = useCallback(async (absoluteFrame: number) => {
    const currentProject = projectRef.current;
    const currentScene = sceneRef.current;
    if (!currentProject || !currentScene || currentProject.kind !== "broll") return;
    if (splitNoticeTimeoutRef.current !== null) {
      window.clearTimeout(splitNoticeTimeoutRef.current);
      splitNoticeTimeoutRef.current = null;
    }
    const removed = await sceneOperations.splitScene(currentScene.id, absoluteFrame);
    if (removed > 0) {
      setSplitNotice(
        `Split scene: removed ${removed} animation${removed === 1 ? "" : "s"} crossing the split point.`,
      );
      splitNoticeTimeoutRef.current = window.setTimeout(() => {
        setSplitNotice(null);
        splitNoticeTimeoutRef.current = null;
      }, 8000);
    }
  }, [projectRef, sceneRef, sceneOperations]);

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
  const currentSceneIndex =
    project.scenes.findIndex((reference) => reference.id === scene.id);
  const nextSceneReference = project.scenes[currentSceneIndex + 1];
  const nextScene = nextSceneReference
    ? scenesById[nextSceneReference.id]
    : null;
  const maximumDurationInFrames = project.kind === "broll" && nextScene
    ? sceneStartFrameForProject(project, nextScene) - sceneStartFrameForProject(project, scene)
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

  const drillGroup =
    activeInsertionGroupId && scene
      ? findLayerById(scene.layers, activeInsertionGroupId)
      : null;

  return (
    <main
      className="editor-app"
      onClick={() => {
        setContextMenu(null);
        setSlideMenu(null);
      }}
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
          {splitNotice ? (
            <span className="toolbar-notice">{splitNotice}</span>
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
            isSlideProject={project.kind === "slide"}
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
            onAddScene={() => void sceneOperations.addScene(project.kind === "slide" ? project.scenes.length : undefined)}
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
            activeInsertionGroupId={activeInsertionGroupId}
            inspectorScope={inspectorScope}
            isSceneSwitchDisabled={
              isSceneLoading || isCreatingScene || hasSaveConflict
            }
            isSlideProject={project.kind === "slide"}
            onSceneSelect={(sceneId) => {
              setSlideMenu(null);
              void sceneOperations.selectScene(sceneId);
            }}
            onSceneContextMenu={(sceneId, x, y) => void handleSlideContextMenu(sceneId, x, y)}
            onSceneMove={sceneOperations.moveScene}
            onSceneRename={handleSceneRename}
            onLayerSelect={selection.onTreeLayerSelect}
            onLayerRename={handleLayerRename}
            onLayerMove={handleTreeLayerMove}
            onLayerStateChange={handleLayerStateChange}
          />
        </aside>

        <section
          className={`canvas-workspace${timelineResize.isResizing ? " is-resizing" : ""}`}
          aria-label="Fabric editor"
          style={{
            gridTemplateRows: `minmax(0, 1fr) 7px ${timelineResize.height}px`,
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
                    audioFile={project.kind === "broll" ? project.audioFile : null}
                    timelineStartFrame={sceneStartFrameForProject(project, scene)}
                    projectWidth={project.width}
                    projectHeight={project.height}
                    fps={project.fps}
                    displayScale={0.5}
                    playerRef={previewPlayerRef}
                  />
                ) : (
                  <FabricSceneCanvas
                    document={{
                      scene,
                      projectId: project.id,
                      projectWidth: project.width,
                      projectHeight: project.height,
                      displayScale: BASE_CANVAS_SCALE,
                      zoom: canvasZoom.zoom,
                      zoomCursorRef: canvasZoom.cursorRef,
                      canvasElementRef,
                      onSceneChange: handleSceneChange,
                    }}
                    selection={{
                      selectedLayerIds,
                      onSelectedLayerIdsChange: selection.onCanvasSelection,
                      onGroupEditEnter: selection.onGroupEditEnter,
                      onContextMenuRequest: openLayerContextMenu,
                      drillGroupId: activeInsertionGroupId,
                      onDrillExit: () => setActiveInsertionGroupId(null),
                    }}
                    crop={{
                      croppingLayerId,
                      onImageCropEnter: enterImageCrop,
                      onImageCropExit: exitImageCrop,
                      onImageCropCommit: commitImageCrop,
                    }}
                    text={{
                      pendingTextEditLayerId,
                      onPendingTextEditConsumed: () =>
                        setPendingTextEditLayerId(null),
                      onTextLayerChange: layerEdits.changeTextLayer,
                    }}
                    animation={{
                      selectedAnimationId:
                        inspectorTab === "animate" ? selectedAnimationId : null,
                      onMagicMoveTranslationCommit:
                        layerEdits.commitMagicMoveTranslation,
                    }}
                  />
                )}
                {isPreviewMode ? (
                  <span className="preview-mode-badge">Preview</span>
                ) : null}
                {drillGroup && drillGroup.type === "group" && !isPreviewMode ? (
                  <nav className="drill-breadcrumb" aria-label="Group drill path">
                    <button
                      type="button"
                      className="drill-breadcrumb-exit"
                      onClick={() => {
                        setActiveInsertionGroupId(null);
                        setSelectedLayerIds([]);
                      }}
                      title="Exit group"
                    >
                      {scene.name}
                    </button>
                    <span className="drill-breadcrumb-sep" aria-hidden="true">
                      /
                    </span>
                    <span className="drill-breadcrumb-current">
                      {drillGroup.name}
                    </span>
                  </nav>
                ) : null}
              </div>
            </div>
            {!isPreviewMode ? (
              <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom">
                <button
                  type="button"
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => canvasZoom.zoomBy(-ZOOM_STEP)}
                >
                  −
                </button>
                <span>{Math.round(BASE_CANVAS_SCALE * canvasZoom.zoom * 100)}%</span>
                <button
                  type="button"
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => canvasZoom.zoomBy(ZOOM_STEP)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="canvas-zoom-fit"
                  title="Reset zoom to fit"
                  onClick={canvasZoom.resetZoom}
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
            aria-valuenow={Math.round(timelineResize.height)}
            className="timeline-resize-handle"
            onDoubleClick={timelineResize.reset}
            onKeyDown={timelineResize.onKeyDown}
            onPointerDown={timelineResize.onPointerDown}
            onPointerMove={timelineResize.onPointerMove}
            onPointerUp={timelineResize.onPointerEnd}
            onPointerCancel={timelineResize.onPointerEnd}
          >
            <span />
          </button>
          <SceneAnimationTimeline
            scene={scene}
            timelineStartFrame={sceneStartFrameForProject(project, scene)}
            fps={project.fps}
            selectedLayerId={selectedLayerId}
            selectedAnimationId={selectedAnimationId}
            isPreviewMode={isPreviewMode}
            playerRef={previewPlayerRef}
            onSeek={handlePreviewSeek}
            onAnimationSelect={selection.onAnimationSelect}
            onAnimationTimingChange={layerEdits.changeAnimationTiming}
            subtitleCues={project.kind === "broll" ? subtitleCues : []}
            onSplitScene={project.kind === "broll" ? handleSplitScene : null}
            onDeselect={() => selection.onCanvasSelection([])}
          />
        </section>

        <EditorInspector
          project={project} scene={scene}
          maximumDurationInFrames={maximumDurationInFrames}
          selection={{
            tab: inspectorTab, scope: inspectorScope, layerIds: selectedLayerIds,
            layer: selectedLayer, isGroupChild: Boolean(selectedLayerParentGroup),
            animationId: selectedAnimationId, canGroup,
          }}
          actions={{
            setTab: setInspectorTab, onProjectChange: handleProjectChange,
            onSceneChange: handleSceneChange, onAlign: handleAlign,
            onGroup: handleGroupSelection, onDuplicate: handleDuplicateSelection,
            onReorder: handleReorderSelection, onPatch: layerEdits.patchSelectedLayer,
            onReplaceImage: handleReplaceImage,
            onAnimationSelect: setSelectedAnimationId,
            onAnimationsChange: layerEdits.changeSelectedLayerAnimations,
            onImageCropEnter: enterImageCrop,
            onImageCropExit: exitImageCrop,
            croppingLayerId,
          }}
        />
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
          <button type="button" role="menuitem" disabled={!hasClipboard} onClick={handlePasteSelection}>
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
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              setContextMenu(null);
              layerCommands.deleteSelection();
            }}
          >
            <span>Delete</span><kbd>⌫</kbd>
          </button>
        </div>
      ) : null}
      {slideMenu && project.kind === "slide" ? (
        <div
          className="layer-context-menu scene-context-menu"
          role="menu"
          aria-label="Page actions"
          style={{ left: slideMenu.x, top: slideMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const index = project.scenes.findIndex((reference) => reference.id === slideMenu.sceneId);
              setSlideMenu(null);
              if (index !== -1) void sceneOperations.addScene(index + 1);
            }}
          >
            New Page
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const sceneId = slideMenu.sceneId;
              setSlideMenu(null);
              void sceneOperations.duplicateScene(sceneId);
            }}
          >
            Duplicate Page
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={project.scenes.length <= 1}
            onClick={() => {
              setSlideMenu(null);
              void handleDeleteSelection();
            }}
          >
            Delete Page
          </button>
        </div>
      ) : null}
    </main>
  );
}

export default App;
