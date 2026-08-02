import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./App.css";
import {
  createScene,
  deleteScene as deleteSceneRequest,
  ExternalChangeConflictError,
  fetchProject,
  fetchScene,
  saveProject,
  saveScene,
  uploadImageAsset,
} from "./api/projectApi";
import type { LayerAnimation } from "./domain/layerAnimationSchema";
import type { Project } from "./domain/projectSchema";
import type { Layer, Scene } from "./domain/sceneSchema";
import {
  canFlattenGroup,
  cloneLayersToTop,
  deleteLayers,
  duplicateSelectedLayers,
  findLayerById,
  getAllLayers,
  getCombinedBounds,
  getLayerBounds,
  makeGroup,
  reorderSelectedLayersZIndex,
  scaleGroupChildren,
  ungroupLayer,
  updateLayerById,
  type ZOrderAction,
} from "./domain/groupOperations";
import type { AlignmentAction } from "./editor/alignment";
import { EditorToolbar } from "./editor/EditorToolbar";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { LayerAnimationPanel } from "./editor/LayerAnimationPanel";
import { SceneAnimationTimeline } from "./editor/SceneAnimationTimeline";
import {
  LayerPropertiesPanel,
  MultiLayerPropertiesPanel,
  type EditableLayerPatch,
} from "./editor/LayerPropertiesPanel";
import { SceneLayerTree } from "./editor/SceneLayerTree";
import { ScenePropertiesPanel } from "./editor/ScenePropertiesPanel";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./preview/previewChannel";
import { computeTextBoxSize, measureNaturalTextSize } from "./editor/textMetrics";

const DEFAULT_PROJECT_ID = "video001";
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function resolveProjectIdFromUrl(): string {
  const param = new URLSearchParams(window.location.search).get("project");
  return param && PROJECT_ID_PATTERN.test(param) ? param : DEFAULT_PROJECT_ID;
}

const PROJECT_ID = resolveProjectIdFromUrl();
const DEFAULT_TIMELINE_HEIGHT = 224;
const MIN_TIMELINE_HEIGHT = 120;
const MIN_CANVAS_HEIGHT = 240;
const AUTO_SAVE_DELAY_MS = 600;
const EXTERNAL_REFRESH_INTERVAL_MS = 3000;

type InspectorTab = "design" | "animate";
type InspectorScope = "scene" | "layer";
type AddableLayerType = "text" | "rectangle" | "circle" | "triangle" | "arrow";

const MAX_IMAGE_DIMENSION = 1280;

interface EditorSnapshot {
  project: Project;
  scene: Scene;
  scenesById: Record<string, Scene>;
  selectedLayerIds: string[];
  inspectorScope: InspectorScope;
  isDirty: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildImageLayer(
  project: Project,
  scene: Scene,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  id: string,
): Layer {
  const zIndex = Math.max(-1, ...scene.layers.map((layer) => layer.zIndex)) + 1;
  const fitted = scaleToFit(naturalWidth, naturalHeight, MAX_IMAGE_DIMENSION);
  return {
    id,
    name: "Image",
    type: "image",
    x: (project.width - fitted.width) / 2,
    y: (project.height - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    src,
    cornerRadius: 0,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
  };
}

function measureTextBounds(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  fontStyle: "normal" | "italic",
  lineHeight: number,
  letterSpacing: number,
): { width: number; height: number } {
  return measureNaturalTextSize(text, {
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    lineHeight,
    letterSpacing,
  });
}


function alignSceneLayers(
  scene: Scene,
  selectedLayerIds: readonly string[],
  action: AlignmentAction,
  projectWidth: number,
  projectHeight: number,
): Scene {
  const selectedLayerIdSet = new Set(selectedLayerIds);

  if (selectedLayerIdSet.size === 0) {
    return scene;
  }

  interface AlignSpace {
    spaceId: string;
    width: number;
    height: number;
    layers: Layer[];
  }

  const spaces = new Map<string, AlignSpace>();
  const getSpace = (spaceId: string, width: number, height: number): AlignSpace => {
    let space = spaces.get(spaceId);
    if (!space) {
      space = { spaceId, width, height, layers: [] };
      spaces.set(spaceId, space);
    }
    return space;
  };

  for (const layer of scene.layers) {
    if (layer.type === "group") {
      const childLayers = layer.children.filter((child) =>
        selectedLayerIdSet.has(child.id),
      );
      if (childLayers.length > 0) {
        getSpace(layer.id, layer.width, layer.height).layers.push(...childLayers);
      }
    } else if (selectedLayerIdSet.has(layer.id)) {
      getSpace("scene", projectWidth, projectHeight).layers.push(layer);
    }
  }

  // Mixed coordinate spaces must not produce wrong coordinates: safe no-op.
  if (spaces.size !== 1) {
    return scene;
  }

  const space = [...spaces.values()][0];
  const selectedLayers = space.layers;

  if (selectedLayers.length === 0) {
    return scene;
  }

  const boundsById = new Map(
    selectedLayers.map((layer) => [layer.id, getLayerBounds(layer)]),
  );
  const nextCenters = new Map<string, { x?: number; y?: number }>();

  if (
    action === "distribute-horizontal" ||
    action === "distribute-vertical"
  ) {
    if (selectedLayers.length < 3) {
      return scene;
    }

    const isHorizontal = action === "distribute-horizontal";
    const sortedLayers = [...selectedLayers].sort((first, second) => {
      const firstBounds = boundsById.get(first.id);
      const secondBounds = boundsById.get(second.id);

      if (!firstBounds || !secondBounds) {
        return 0;
      }

      return isHorizontal
        ? firstBounds.left - secondBounds.left
        : firstBounds.top - secondBounds.top;
    });
    const firstBounds = boundsById.get(sortedLayers[0]?.id ?? "");
    const lastBounds = boundsById.get(sortedLayers.at(-1)?.id ?? "");

    if (!firstBounds || !lastBounds) {
      return scene;
    }

    const totalSize = sortedLayers.reduce((total, layer) => {
      const bounds = boundsById.get(layer.id);
      return total + (bounds ? (isHorizontal ? bounds.width : bounds.height) : 0);
    }, 0);
    const span = isHorizontal
      ? lastBounds.right - firstBounds.left
      : lastBounds.bottom - firstBounds.top;
    const gap = (span - totalSize) / (selectedLayers.length - 1);
    let cursor = isHorizontal ? firstBounds.left : firstBounds.top;

    for (const layer of sortedLayers) {
      const bounds = boundsById.get(layer.id);

      if (!bounds) {
        continue;
      }

      const size = isHorizontal ? bounds.width : bounds.height;
      nextCenters.set(
        layer.id,
        isHorizontal
          ? { x: cursor + size / 2 }
          : { y: cursor + size / 2 },
      );
      cursor += size + gap;
    }
  } else {
    const selectedBounds = [...boundsById.values()];
    const targetBounds =
      selectedLayers.length === 1
        ? {
            left: 0,
            top: 0,
            right: space.width,
            bottom: space.height,
            width: space.width,
            height: space.height,
            centerX: space.width / 2,
            centerY: space.height / 2,
          }
        : getCombinedBounds(selectedBounds);

    for (const layer of selectedLayers) {
      const bounds = boundsById.get(layer.id);

      if (!bounds) {
        continue;
      }

      if (action === "left") {
        nextCenters.set(layer.id, { x: targetBounds.left + bounds.width / 2 });
      } else if (action === "horizontal-center") {
        nextCenters.set(layer.id, { x: targetBounds.centerX });
      } else if (action === "right") {
        nextCenters.set(layer.id, { x: targetBounds.right - bounds.width / 2 });
      } else if (action === "top") {
        nextCenters.set(layer.id, { y: targetBounds.top + bounds.height / 2 });
      } else if (action === "vertical-center") {
        nextCenters.set(layer.id, { y: targetBounds.centerY });
      } else if (action === "bottom") {
        nextCenters.set(layer.id, { y: targetBounds.bottom - bounds.height / 2 });
      }
    }
  }

  let changed = false;
  const layers = scene.layers.map((layer) => {
    if (layer.type === "group") {
      if (!layer.children.some((child) => nextCenters.has(child.id))) {
        return layer;
      }
      const children = layer.children.map((child) => {
        const nextCenter = nextCenters.get(child.id);

        if (!nextCenter) {
          return child;
        }

        const nextX = roundCoordinate(
          (nextCenter.x ?? child.x + child.width / 2) - child.width / 2,
        );
        const nextY = roundCoordinate(
          (nextCenter.y ?? child.y + child.height / 2) - child.height / 2,
        );

        if (nextX === child.x && nextY === child.y) {
          return child;
        }

        changed = true;
        return {
          ...child,
          x: nextX,
          y: nextY,
        };
      });
      return { ...layer, children };
    }

    const nextCenter = nextCenters.get(layer.id);

    if (!nextCenter) {
      return layer;
    }

    const nextX = roundCoordinate(
      (nextCenter.x ?? layer.x + layer.width / 2) - layer.width / 2,
    );
    const nextY = roundCoordinate(
      (nextCenter.y ?? layer.y + layer.height / 2) - layer.height / 2,
    );

    if (nextX === layer.x && nextY === layer.y) {
      return layer;
    }

    changed = true;
    return {
      ...layer,
      x: nextX,
      y: nextY,
    };
  });

  return changed ? { ...scene, layers } : scene;
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

function nextIdForType(usedIds: ReadonlySet<string>, type: string): string {
  const pattern = new RegExp(`^${type}-(\\d+)$`);
  let sequence = 0;

  for (const id of usedIds) {
    const match = pattern.exec(id);
    if (match) sequence = Math.max(sequence, Number(match[1]));
  }

  let candidate = `${type}-${sequence + 1}`;

  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${type}-${sequence + 1}`;
  }

  return candidate;
}

function getNextLayerId(
  layers: readonly Layer[],
  type: AddableLayerType | "image" | "group",
): string {
  const usedIds = new Set(getAllLayers(layers).map((layer) => layer.id));
  return nextIdForType(usedIds, type);
}

function makeLayerIdGenerator(
  layers: readonly Layer[],
): (original: Layer) => string {
  const usedIds = new Set(getAllLayers(layers).map((layer) => layer.id));

  return (original: Layer): string => {
    const type = original.type === "group" ? "group" : original.type;
    const id = nextIdForType(usedIds, type);
    usedIds.add(id);
    return id;
  };
}

function readImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("Failed to read image dimensions"));
    image.src = src;
  });
}

function scaleToFit(
  width: number,
  height: number,
  maximum: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maximum, height: maximum };
  }
  const ratio = Math.min(maximum / width, maximum / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
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
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(
    null,
  );
  const [timelineHeight, setTimelineHeight] = useState(
    DEFAULT_TIMELINE_HEIGHT,
  );
  const [isTimelineResizing, setIsTimelineResizing] = useState(false);
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
  const clipboardLayersRef = useRef<Layer[] | null>(null);
  const replaceImageTargetIdRef = useRef<string | null>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const previewStateRef = useRef<PreviewStateMessage | null>(null);
  const editorSnapshotRef = useRef<EditorSnapshot | null>(null);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const projectRef = useRef<Project | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const projectChangeVersionRef = useRef(0);
  const sceneChangeVersionRef = useRef(0);
  const savedProjectVersionRef = useRef(0);
  const savedSceneVersionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeSaveCountRef = useRef(0);
  const externalRefreshRunningRef = useRef(false);
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

  const updateDirtyState = useCallback(() => {
    setIsDirty(
      projectChangeVersionRef.current > savedProjectVersionRef.current ||
        sceneChangeVersionRef.current > savedSceneVersionRef.current,
    );
  }, []);

  const markProjectChanged = useCallback(() => {
    projectChangeVersionRef.current += 1;
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const markSceneChanged = useCallback(() => {
    sceneChangeVersionRef.current += 1;
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const markCurrentStateSaved = useCallback(() => {
    savedProjectVersionRef.current = projectChangeVersionRef.current;
    savedSceneVersionRef.current = sceneChangeVersionRef.current;
    setIsDirty(false);
    setSaveError(null);
    setHasSaveConflict(false);
  }, []);

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

  editorSnapshotRef.current =
    project && scene
      ? {
          project,
          scene,
          scenesById: { ...scenesById, [scene.id]: scene },
          selectedLayerIds: [...selectedLayerIds],
          inspectorScope,
          isDirty,
        }
      : null;

  useEffect(() => {
    let cancelled = false;

    async function loadProject(): Promise<void> {
      try {
        const loadedProject = await fetchProject(PROJECT_ID);
        const loadedScenes = await Promise.all(
          loadedProject.scenes.map((sceneReference) =>
            fetchScene(loadedProject.id, sceneReference.id),
          ),
        );
        const loadedScene = loadedScenes[0];

        if (!loadedScene) {
          throw new Error("Project contains no scenes");
        }

        if (!cancelled) {
          setProject(loadedProject);
          setScene(loadedScene);
          setScenesById(
            Object.fromEntries(
              loadedScenes.map((candidate) => [candidate.id, candidate]),
            ),
          );
          projectChangeVersionRef.current = 0;
          sceneChangeVersionRef.current = 0;
          savedProjectVersionRef.current = 0;
          savedSceneVersionRef.current = 0;
          setSelectedLayerIds([]);
          setIsDirty(false);
          setHasSaveConflict(false);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const recordHistory = useCallback(() => {
    if (isApplyingHistoryRef.current || !editorSnapshotRef.current) {
      return;
    }

    undoStackRef.current.push(editorSnapshotRef.current);
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryCanUndo(true);
    setHistoryCanRedo(false);
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryCanUndo(false);
    setHistoryCanRedo(false);
  }, []);

  const refreshHistoryAvailability = useCallback(() => {
    setHistoryCanUndo(undoStackRef.current.length > 0);
    setHistoryCanRedo(redoStackRef.current.length > 0);
  }, []);

  const queueCurrentSave = useCallback(
    (force = false): Promise<void> => {
      const projectSnapshot = projectRef.current;
      const sceneSnapshot = sceneRef.current;
      if (!projectSnapshot || !sceneSnapshot) return saveQueueRef.current;

      const projectVersion = projectChangeVersionRef.current;
      const sceneVersion = sceneChangeVersionRef.current;
      const needsProjectSave =
        projectVersion > savedProjectVersionRef.current;
      const needsSceneSave = sceneVersion > savedSceneVersionRef.current;

      if (!needsProjectSave && !needsSceneSave) {
        return saveQueueRef.current;
      }

      const run = saveQueueRef.current.then(async () => {
        activeSaveCountRef.current += 1;
        setIsSaving(true);
        setSaveError(null);

        try {
          if (
            needsProjectSave &&
            projectVersion > savedProjectVersionRef.current
          ) {
            await saveProject(projectSnapshot, { force });
            savedProjectVersionRef.current = Math.max(
              savedProjectVersionRef.current,
              projectVersion,
            );
          }

          if (needsSceneSave && sceneVersion > savedSceneVersionRef.current) {
            await saveScene(projectSnapshot.id, sceneSnapshot, { force });
            savedSceneVersionRef.current = Math.max(
              savedSceneVersionRef.current,
              sceneVersion,
            );
            setScenesById((current) => ({
              ...current,
              [sceneSnapshot.id]: sceneSnapshot,
            }));
          }

          setHasSaveConflict(false);
          updateDirtyState();
        } catch (error: unknown) {
          setSaveError(getErrorMessage(error));
          setHasSaveConflict(error instanceof ExternalChangeConflictError);
          updateDirtyState();
          throw error;
        } finally {
          activeSaveCountRef.current -= 1;
          if (activeSaveCountRef.current === 0) setIsSaving(false);
        }
      });

      saveQueueRef.current = run.catch(() => undefined);
      return run;
    },
    [updateDirtyState],
  );

  const handleSceneChange = useCallback((updatedScene: Scene) => {
    recordHistory();
    setScene(updatedScene);
    markSceneChanged();
  }, [markSceneChanged, recordHistory]);

  const handleProjectChange = useCallback((updatedProject: Project) => {
    recordHistory();
    setProject(updatedProject);
    markProjectChanged();
  }, [markProjectChanged, recordHistory]);

  useEffect(() => {
    if (!isDirty || hasSaveConflict || isSceneLoading || isCreatingScene) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void queueCurrentSave().catch(() => undefined);
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [
    hasSaveConflict,
    isCreatingScene,
    isDirty,
    isSceneLoading,
    project,
    queueCurrentSave,
    scene,
  ]);

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
    setSelectedAnimationId(null);
    setInspectorScope("scene");
    projectChangeVersionRef.current += 1;
    sceneChangeVersionRef.current += 1;
    markCurrentStateSaved();
    clearHistory();
  }, [clearHistory, markCurrentStateSaved]);

  useEffect(() => {
    if (
      isDirty ||
      isSaving ||
      isSceneLoading ||
      isCreatingScene ||
      hasSaveConflict
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      if (externalRefreshRunningRef.current) return;
      externalRefreshRunningRef.current = true;

      const beforeProject = projectRef.current;
      const beforeScenes = beforeProject
        ? beforeProject.scenes.map((reference) => scenesById[reference.id])
        : [];

      void (async () => {
        try {
          if (!beforeProject) return;
          const loadedProject = await fetchProject(beforeProject.id);
          const loadedScenes = await Promise.all(
            loadedProject.scenes.map((reference) =>
              fetchScene(loadedProject.id, reference.id),
            ),
          );
          const projectChanged =
            JSON.stringify(loadedProject) !== JSON.stringify(beforeProject);
          const scenesChanged =
            JSON.stringify(loadedScenes) !== JSON.stringify(beforeScenes);

          if (projectChanged || scenesChanged) {
            const nextScenesById = Object.fromEntries(
              loadedScenes.map((candidate) => [candidate.id, candidate]),
            );
            const currentSceneId = sceneRef.current?.id;
            const loadedScene =
              (currentSceneId ? nextScenesById[currentSceneId] : undefined) ??
              loadedScenes[0];
            if (!loadedScene) return;
            setProject(loadedProject);
            setScene(loadedScene);
            setScenesById(nextScenesById);
            setSelectedLayerIds([]);
            setSelectedAnimationId(null);
            setInspectorScope("scene");
            projectChangeVersionRef.current += 1;
            sceneChangeVersionRef.current += 1;
            markCurrentStateSaved();
            clearHistory();
          }
        } catch (error: unknown) {
          setSceneError(getErrorMessage(error));
        } finally {
          externalRefreshRunningRef.current = false;
        }
      })();
    }, EXTERNAL_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [
    clearHistory,
    hasSaveConflict,
    isCreatingScene,
    isDirty,
    isSaving,
    isSceneLoading,
    markCurrentStateSaved,
    project,
    scenesById,
  ]);

  const handleReloadExternalChanges = useCallback(async () => {
    setIsSceneLoading(true);
    setSceneError(null);
    try {
      await saveQueueRef.current;
      await loadAllFromDisk();
    } catch (error: unknown) {
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }, [loadAllFromDisk]);

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
    },
    [handleSceneChange, scene],
  );

  const applyHistorySnapshot = useCallback(async (snapshot: EditorSnapshot) => {
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

    if (restoredSceneIds.length > 0) {
      await saveProject(snapshot.project);
      for (const sceneId of restoredSceneIds) {
        const restoredScene = snapshot.scenesById[sceneId];
        if (!restoredScene) throw new Error(`Missing scene snapshot: ${sceneId}`);
        await saveScene(snapshot.project.id, restoredScene);
      }
    } else if (removedSceneIds.length > 0) {
      for (const sceneId of removedSceneIds) {
        await deleteSceneRequest(current.project.id, sceneId);
      }
      await saveProject(snapshot.project);
    }

    setProject(snapshot.project);
    setScene(snapshot.scene);
    setScenesById(snapshot.scenesById);
    setSelectedLayerIds(snapshot.selectedLayerIds);
    setInspectorScope(snapshot.inspectorScope);
    if (projectChanged) projectChangeVersionRef.current += 1;
    if (sceneChanged) sceneChangeVersionRef.current += 1;
    updateDirtyState();
    setSaveError(null);
    setHasSaveConflict(false);
    setSceneError(null);
  }, [updateDirtyState]);

  const handleUndo = useCallback(async () => {
    if (isApplyingHistoryRef.current || isSceneLoading) return;
    const current = editorSnapshotRef.current;
    const previous = undoStackRef.current.pop();
    if (!current || !previous) return;

    isApplyingHistoryRef.current = true;
    redoStackRef.current.push(current);
    try {
      await applyHistorySnapshot(previous);
    } catch (error: unknown) {
      redoStackRef.current.pop();
      undoStackRef.current.push(previous);
      setSceneError(getErrorMessage(error));
    } finally {
      isApplyingHistoryRef.current = false;
      refreshHistoryAvailability();
    }
  }, [applyHistorySnapshot, isSceneLoading, refreshHistoryAvailability]);

  const handleRedo = useCallback(async () => {
    if (isApplyingHistoryRef.current || isSceneLoading) return;
    const current = editorSnapshotRef.current;
    const next = redoStackRef.current.pop();
    if (!current || !next) return;

    isApplyingHistoryRef.current = true;
    undoStackRef.current.push(current);
    try {
      await applyHistorySnapshot(next);
    } catch (error: unknown) {
      undoStackRef.current.pop();
      redoStackRef.current.push(next);
      setSceneError(getErrorMessage(error));
    } finally {
      isApplyingHistoryRef.current = false;
      refreshHistoryAvailability();
    }
  }, [applyHistorySnapshot, isSceneLoading, refreshHistoryAvailability]);

  const handleDeleteSelection = useCallback(async () => {
    if (!project || !scene || isSceneLoading) {
      return;
    }

    if (inspectorScope === "layer") {
      if (selectedLayerIds.length === 0) {
        return;
      }

      const selectedIds = new Set(selectedLayerIds);
      const wouldFlattenProtectedGroup = scene.layers.some(
        (layer) =>
          layer.type === "group" &&
          layer.children.filter((child) => !selectedIds.has(child.id)).length === 1 &&
          !canFlattenGroup(layer),
      );
      if (wouldFlattenProtectedGroup) {
        setSceneError(
          "Remove the group animation or opacity before deleting this child",
        );
        return;
      }
      handleSceneChange(deleteLayers(scene, selectedLayerIds));
      setSelectedLayerIds([]);
      setSelectedAnimationId(null);
      setInspectorScope("scene");
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
      projectChangeVersionRef.current += 1;
      sceneChangeVersionRef.current += 1;
      markCurrentStateSaved();
    } catch (error: unknown) {
      undoStackRef.current.pop();
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }, [
    handleSceneChange,
    inspectorScope,
    isSceneLoading,
    markCurrentStateSaved,
    project,
    queueCurrentSave,
    recordHistory,
    scene,
    scenesById,
    selectedLayerIds,
  ]);

  const handleGroupSelection = useCallback(() => {
    if (!scene) return;
    const groupId = getNextLayerId(scene.layers, "group");
    const groupNumber = Number(groupId.split("-").at(-1)) || 1;
    const updatedScene = makeGroup(
      scene,
      selectedLayerIds,
      groupId,
      `Group ${groupNumber}`,
    );
    if (!updatedScene) return;
    handleSceneChange(updatedScene);
    setSelectedLayerIds([groupId]);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    setContextMenu(null);
  }, [handleSceneChange, scene, selectedLayerIds]);

  const handleUngroupSelection = useCallback(() => {
    if (!scene || selectedLayerIds.length !== 1) return;
    const groupId = selectedLayerIds[0];
    if (!groupId) return;
    const group = findLayerById(scene.layers, groupId);
    if (!group || group.type !== "group") return;
    if (!canFlattenGroup(group)) {
      setSceneError(
        "Remove the group animation or opacity before ungrouping",
      );
      setContextMenu(null);
      return;
    }
    const updatedScene = ungroupLayer(scene, groupId);
    if (!updatedScene) return;
    handleSceneChange(updatedScene);
    setSelectedLayerIds(group.children.map((child) => child.id));
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    setContextMenu(null);
  }, [handleSceneChange, scene, selectedLayerIds]);

  const handleDuplicateSelection = useCallback(() => {
    if (!scene || selectedLayerIds.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedLayerIds);
    const targets: Layer[] = [];

    for (const layer of scene.layers) {
      if (selectedIdSet.has(layer.id)) targets.push(layer);
      if (layer.type === "group") {
        for (const child of layer.children) {
          if (selectedIdSet.has(child.id)) targets.push(child);
        }
      }
    }

    if (targets.length !== selectedLayerIds.length) {
      return;
    }

    const generator = makeLayerIdGenerator(getAllLayers(scene.layers));
    const idByOriginal = new Map<Layer, string>();

    for (const target of targets) {
      idByOriginal.set(target, generator(target));
    }

    const newIdFor = (original: Layer): string =>
      idByOriginal.get(original) ?? generator(original);
    const updatedScene = duplicateSelectedLayers(
      scene,
      selectedLayerIds,
      newIdFor,
    );
    if (updatedScene === scene) {
      return;
    }

    handleSceneChange(updatedScene);
    const newIds = targets
      .map((target) => idByOriginal.get(target))
      .filter((id): id is string => Boolean(id));
    setSelectedLayerIds(newIds);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    setContextMenu(null);
  }, [handleSceneChange, scene, selectedLayerIds]);

  const handleCopySelection = useCallback(() => {
    if (!scene || selectedLayerIds.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedLayerIds);
    const topLevel = scene.layers.filter((layer) =>
      selectedIdSet.has(layer.id),
    );
    if (topLevel.length === 0) {
      return;
    }

    clipboardLayersRef.current = JSON.parse(
      JSON.stringify(topLevel),
    ) as Layer[];
    setContextMenu(null);
  }, [scene, selectedLayerIds]);

  const handlePasteSelection = useCallback(() => {
    const clipboard = clipboardLayersRef.current;
    if (!scene || !clipboard || clipboard.length === 0) {
      return;
    }

    const generator = makeLayerIdGenerator(getAllLayers(scene.layers));
    const idByOriginal = new Map<Layer, string>();

    for (const layer of clipboard) {
      idByOriginal.set(layer, generator(layer));
    }

    const newIdFor = (original: Layer): string =>
      idByOriginal.get(original) ?? generator(original);
    const updatedScene = cloneLayersToTop(scene, clipboard, newIdFor, 24, 24);
    if (updatedScene === scene) {
      return;
    }

    handleSceneChange(updatedScene);
    const newIds = clipboard
      .map((layer) => idByOriginal.get(layer))
      .filter((id): id is string => Boolean(id));
    setSelectedLayerIds(newIds);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    setContextMenu(null);
  }, [handleSceneChange, scene]);

  const handleReorderSelection = useCallback(
    (action: ZOrderAction) => {
      if (!scene || selectedLayerIds.length === 0) {
        return;
      }
      const updatedScene = reorderSelectedLayersZIndex(
        scene,
        selectedLayerIds,
        action,
      );
      if (updatedScene === scene) {
        return;
      }
      handleSceneChange(updatedScene);
    },
    [handleSceneChange, scene, selectedLayerIds],
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
      if (!scene || !project) {
        return;
      }

      const updatedScene = alignSceneLayers(
        scene,
        selectedLayerIds,
        action,
        project.width,
        project.height,
      );

      if (updatedScene !== scene) {
        handleSceneChange(updatedScene);
      }
    },
    [handleSceneChange, project, scene, selectedLayerIds],
  );

  function handleAddLayer(type: AddableLayerType): void {
    if (!scene || !project) {
      return;
    }

    const id = getNextLayerId(scene.layers, type);
    const zIndex = Math.max(-1, ...scene.layers.map((layer) => layer.zIndex)) + 1;
    const layer: Layer = (() => {
      switch (type) {
        case "text": {
          const textDefaults = {
            text: "Text",
            fontFamily: "Arial",
            fontSize: 72,
            fontWeight: 400,
            fontStyle: "normal",
            lineHeight: 1.2,
            letterSpacing: 0,
          } as const;
          const dims = measureTextBounds(
            textDefaults.text,
            textDefaults.fontFamily,
            textDefaults.fontSize,
            textDefaults.fontWeight,
            textDefaults.fontStyle,
            textDefaults.lineHeight,
            textDefaults.letterSpacing,
          );
          return {
            id,
            name: "Text",
            type: "text",
            x: (project.width - dims.width) / 2,
            y: (project.height - dims.height) / 2,
            width: dims.width,
            height: dims.height,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            text: textDefaults.text,
            fontFamily: textDefaults.fontFamily,
            fontSize: textDefaults.fontSize,
            fontWeight: textDefaults.fontWeight,
            fontStyle: textDefaults.fontStyle,
            lineHeight: textDefaults.lineHeight,
            letterSpacing: textDefaults.letterSpacing,
            textAlign: "center",
            verticalAlign: "middle",
            autoResize: "both",
            textCase: "normal",
            kerningPairs: true,
            ligatures: true,
            fill: "#ffffff",
            fillEnabled: true,
            stroke: null,
            strokeWidth: 0,
            strokePosition: "inside",
          };
        }
        case "rectangle":
          return {
            id,
            name: "Rectangle",
            type: "rectangle",
            x: (project.width - 400) / 2,
            y: (project.height - 240) / 2,
            width: 400,
            height: 240,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            fill: "#6b7280",
            fillEnabled: true,
            stroke: null,
            strokeWidth: 0,
            strokePosition: "inside",
            cornerEnabled: true,
            cornerRadius: 0,
            cornerRadii: null,
          };
        case "circle":
          return {
            id,
            name: "Circle",
            type: "circle",
            x: (project.width - 240) / 2,
            y: (project.height - 240) / 2,
            width: 240,
            height: 240,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            fill: "#6b7280",
            fillEnabled: true,
            stroke: null,
            strokeWidth: 0,
            strokePosition: "inside",
            donut: 0,
            sweep: 360,
            startAngle: 0,
          };
        case "triangle":
          return {
            id,
            name: "Triangle",
            type: "triangle",
            x: (project.width - 280) / 2,
            y: (project.height - 240) / 2,
            width: 280,
            height: 240,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            fill: "#6b7280",
            fillEnabled: true,
            stroke: null,
            strokeWidth: 0,
            cornerEnabled: true,
            cornerRadius: 0,
          };
        case "arrow":
          return {
            id,
            name: "Arrow",
            type: "arrow",
            x: (project.width - 360) / 2,
            y: (project.height - 24) / 2,
            width: 360,
            height: 24,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            stroke: "#1f2937",
            strokeWidth: 6,
            arrowHeadSize: 24,
            arrowStartStyle: "none",
            arrowEndStyle: "triangle",
          };
      }
    })();

    setSelectedLayerIds([layer.id]);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
    if (type === "text") {
      setPendingTextEditLayerId(layer.id);
    }
    handleSceneChange({
      ...scene,
      layers: [...scene.layers, layer],
    });
  }

  const handleAddImage = useCallback(() => {
    if (!project || !scene || isUploadingImage) {
      return;
    }
    replaceImageTargetIdRef.current = null;
    imageFileInputRef.current?.click();
  }, [isUploadingImage, project, scene]);

  const handleImageFileChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = "";
      if (!file || !project || !scene) {
        return;
      }

      setIsUploadingImage(true);
      setImageUploadError(null);
      setSceneError(null);
      const replaceTargetId = replaceImageTargetIdRef.current;
      replaceImageTargetIdRef.current = null;
      try {
        const asset = await uploadImageAsset(project.id, file, file.name);
        const dataUrl = URL.createObjectURL(file);
        let dimensions: { width: number; height: number };
        try {
          dimensions = await readImageDimensions(dataUrl);
        } finally {
          URL.revokeObjectURL(dataUrl);
        }
        const fitted = scaleToFit(
          dimensions.width,
          dimensions.height,
          MAX_IMAGE_DIMENSION,
        );

        if (replaceTargetId) {
          const target = findLayerById(scene.layers, replaceTargetId);
          if (!target || target.type !== "image") {
            setImageUploadError("The selected layer is no longer an image");
            return;
          }
          const updatedLayers = updateLayerById(
            scene.layers,
            replaceTargetId,
            (layer) => {
              if (layer.type !== "image") {
                return layer;
              }
              return {
                ...layer,
                src: asset.src,
                width: fitted.width,
                height: fitted.height,
              };
            },
          );
          handleSceneChange({ ...scene, layers: updatedLayers });
          return;
        }

        const id = getNextLayerId(scene.layers, "image");
        const layer = buildImageLayer(
          project,
          scene,
          asset.src,
          dimensions.width,
          dimensions.height,
          id,
        );
        setSelectedLayerIds([layer.id]);
        setSelectedAnimationId(null);
        setInspectorScope("layer");
        handleSceneChange({
          ...scene,
          layers: [...scene.layers, layer],
        });
      } catch (error: unknown) {
        setImageUploadError(getErrorMessage(error));
        setSceneError(getErrorMessage(error));
      } finally {
        setIsUploadingImage(false);
      }
    },
    [handleSceneChange, project, scene],
  );

  const handleReplaceImage = useCallback(() => {
    if (!project || !scene || isUploadingImage || !selectedLayerId) {
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

        return {
          ...layer,
          ...patch,
        } as Layer;
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
      if (!selected || selected.locked || parentGroup?.locked) return;

      let changed = false;
      const updatedLayers = updateLayerById(scene.layers, layerId, (layer) => {
        const isSame =
          layer.animations.length === animations.length &&
          layer.animations.every((animation, index) => {
            const candidate = animations[index];

            return (
              candidate !== undefined &&
              animation.id === candidate.id &&
              animation.phase === candidate.phase &&
              animation.preset === candidate.preset &&
              animation.startFrame === candidate.startFrame &&
              animation.durationInFrames === candidate.durationInFrames &&
              animation.easing === candidate.easing
            );
          });

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
      if (!target || target.type !== "text" || target.locked) {
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

  const handleAnimationSelect = useCallback(
    (layerId: string, animationId: string) => {
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
  ): Promise<void> {
    if (!project) {
      return;
    }

    if (sceneId === scene?.id) {
      setSelectedLayerIds(nextSelectedLayerIds);
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      return;
    }

    if (isSceneLoading || hasSaveConflict) {
      return;
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
      setSelectedAnimationId(null);
      setInspectorScope(nextScope);
      sceneChangeVersionRef.current += 1;
      markCurrentStateSaved();
      clearHistory();
    } catch (error: unknown) {
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
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
      projectChangeVersionRef.current += 1;
      sceneChangeVersionRef.current += 1;
      markCurrentStateSaved();
    } catch (error: unknown) {
      undoStackRef.current.pop();
      setCreateSceneError(getErrorMessage(error));
    } finally {
      setIsCreatingScene(false);
    }
  }

  const handleOpenPreview = useCallback(() => {
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

  const selectedLayer: Layer | null = scene && selectedLayerId
    ? findLayerById(scene.layers, selectedLayerId)
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
    selectedLayer?.type === "group" && canFlattenGroup(selectedLayer);
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
            onUndo={() => void handleUndo()}
            onRedo={() => void handleRedo()}
            onAddText={() => handleAddLayer("text")}
            onAddImage={handleAddImage}
            onAddRectangle={() => handleAddLayer("rectangle")}
            onAddCircle={() => handleAddLayer("circle")}
            onAddTriangle={() => handleAddLayer("triangle")}
            onAddArrow={() => handleAddLayer("arrow")}
            onAddScene={() => void handleAddScene()}
            onOpenPreview={handleOpenPreview}
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
            inspectorScope={inspectorScope}
            isSceneSwitchDisabled={
              isSceneLoading || isCreatingScene || hasSaveConflict
            }
            onSceneSelect={(sceneId) => void handleSceneSelect(sceneId)}
            onLayerSelect={handleTreeLayerSelect}
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
          <div className="canvas-editor-area">
            <div className="canvas-stage">
              <div className="canvas-frame">
                <FabricSceneCanvas
                  scene={scene}
                  projectId={project.id}
                  projectWidth={project.width}
                  projectHeight={project.height}
                  displayScale={0.5}
                  onSceneChange={handleSceneChange}
                  onSelectedLayerIdsChange={handleSelectedLayerIdsChange}
                  onHoveredLayerIdChange={setHoveredLayerId}
                  onContextMenuRequest={openLayerContextMenu}
                  selectedLayerIds={selectedLayerIds}
                  pendingTextEditLayerId={pendingTextEditLayerId}
                  onPendingTextEditConsumed={() => setPendingTextEditLayerId(null)}
                  onTextLayerChange={handleTextLayerChange}
                />
              </div>
            </div>
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
