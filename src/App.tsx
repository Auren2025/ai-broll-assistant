import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import {
  createScene,
  deleteScene as deleteSceneRequest,
  fetchProject,
  fetchScene,
  saveProject,
  saveScene,
} from "./api/projectApi";
import type { LayerAnimation } from "./domain/layerAnimationSchema";
import type { Project } from "./domain/projectSchema";
import type { Layer, Scene } from "./domain/sceneSchema";
import { AlignmentToolbar, type AlignmentAction } from "./editor/AlignmentToolbar";
import { EditorToolbar } from "./editor/EditorToolbar";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { LayerAnimationPanel } from "./editor/LayerAnimationPanel";
import {
  LayerPropertiesPanel,
  type EditableLayerPatch,
} from "./editor/LayerPropertiesPanel";
import { SceneLayerTree } from "./editor/SceneLayerTree";
import { ScenePropertiesPanel } from "./editor/ScenePropertiesPanel";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./preview/previewChannel";

const PROJECT_ID = "video001";

type InspectorTab = "design" | "animate";
type InspectorScope = "scene" | "layer";
type AddableLayerType = "text" | "rectangle" | "circle" | "triangle" | "arrow";

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

interface LayerBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getLayerBounds(layer: Layer): LayerBounds {
  const radians = (layer.rotation * Math.PI) / 180;
  const scaledWidth = layer.width * layer.scaleX;
  const scaledHeight = layer.height * layer.scaleY;
  const width =
    Math.abs(scaledWidth * Math.cos(radians)) +
    Math.abs(scaledHeight * Math.sin(radians));
  const height =
    Math.abs(scaledWidth * Math.sin(radians)) +
    Math.abs(scaledHeight * Math.cos(radians));
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerX,
    centerY,
  };
}

function getCombinedBounds(bounds: readonly LayerBounds[]): LayerBounds {
  const left = Math.min(...bounds.map((candidate) => candidate.left));
  const top = Math.min(...bounds.map((candidate) => candidate.top));
  const right = Math.max(...bounds.map((candidate) => candidate.right));
  const bottom = Math.max(...bounds.map((candidate) => candidate.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function alignSceneLayers(
  scene: Scene,
  selectedLayerIds: readonly string[],
  action: AlignmentAction,
  projectWidth: number,
  projectHeight: number,
): Scene {
  const selectedLayerIdSet = new Set(selectedLayerIds);
  const selectedLayers = scene.layers.filter((layer) =>
    selectedLayerIdSet.has(layer.id),
  );

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
            right: projectWidth,
            bottom: projectHeight,
            width: projectWidth,
            height: projectHeight,
            centerX: projectWidth / 2,
            centerY: projectHeight / 2,
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

function getNextLayerId(
  layers: readonly Layer[],
  type: AddableLayerType,
): string {
  const pattern = new RegExp(`^${type}-(\\d+)$`);
  const usedIds = new Set(layers.map((layer) => layer.id));
  let nextSequence = layers.reduce((highest, layer) => {
    const match = pattern.exec(layer.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  let candidate = `${type}-${nextSequence}`;

  while (usedIds.has(candidate)) {
    nextSequence += 1;
    candidate = `${type}-${nextSequence}`;
  }

  return candidate;
}

function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [scenesById, setScenesById] = useState<Record<string, Scene>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createSceneError, setCreateSceneError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(false);
  const [isCreatingScene, setIsCreatingScene] = useState(false);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [inspectorScope, setInspectorScope] = useState<InspectorScope>("scene");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const previewStateRef = useRef<PreviewStateMessage | null>(null);
  const editorSnapshotRef = useRef<EditorSnapshot | null>(null);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const selectedLayerId =
    selectedLayerIds.length === 1 ? (selectedLayerIds[0] ?? null) : null;

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
          setSelectedLayerIds([]);
          setIsDirty(false);
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
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const handleSceneChange = useCallback((updatedScene: Scene) => {
    recordHistory();
    setScene(updatedScene);
    setIsDirty(true);
    setSaveError(null);
  }, [recordHistory]);

  const handleProjectChange = useCallback((updatedProject: Project) => {
    recordHistory();
    setProject(updatedProject);
    setIsDirty(true);
    setSaveError(null);
  }, [recordHistory]);

  const handleSelectedLayerIdsChange = useCallback((layerIds: string[]) => {
    setSelectedLayerIds((currentLayerIds) =>
      hasSameLayerIds(currentLayerIds, layerIds) ? currentLayerIds : layerIds,
    );
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
        layers: scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer,
        ),
      } as Scene;

      handleSceneChange(updatedScene);
    },
    [handleSceneChange, scene],
  );

  const applyHistorySnapshot = useCallback(async (snapshot: EditorSnapshot) => {
    const current = editorSnapshotRef.current;
    if (!current) return;

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
    setIsDirty(snapshot.isDirty);
    setSaveError(null);
    setSceneError(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (isApplyingHistoryRef.current || isSaving || isSceneLoading) return;
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
    }
  }, [applyHistorySnapshot, isSaving, isSceneLoading]);

  const handleRedo = useCallback(async () => {
    if (isApplyingHistoryRef.current || isSaving || isSceneLoading) return;
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
    }
  }, [applyHistorySnapshot, isSaving, isSceneLoading]);

  const handleDeleteSelection = useCallback(async () => {
    if (!project || !scene || isSaving || isSceneLoading) {
      return;
    }

    if (inspectorScope === "layer") {
      if (selectedLayerIds.length === 0) {
        return;
      }

      const selectedIdSet = new Set(selectedLayerIds);
      handleSceneChange({
        ...scene,
        layers: scene.layers.filter((layer) => !selectedIdSet.has(layer.id)),
      });
      setSelectedLayerIds([]);
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
      setInspectorScope("scene");
      setIsDirty(false);
      setSaveError(null);
    } catch (error: unknown) {
      undoStackRef.current.pop();
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }, [
    handleSceneChange,
    inspectorScope,
    isSaving,
    isSceneLoading,
    project,
    recordHistory,
    scene,
    scenesById,
    selectedLayerIds,
  ]);

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

      if (event.key !== "Delete" && event.key !== "Backspace") return;

      event.preventDefault();
      void handleDeleteSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDeleteSelection, handleRedo, handleUndo]);

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
        case "text":
          return {
            id,
            name: "Text",
            type: "text",
            x: (project.width - 600) / 2,
            y: (project.height - 120) / 2,
            width: 600,
            height: 120,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            opacityEnabled: true,
            blendMode: "normal",
            zIndex,
            visible: true,
            locked: false,
            animations: [],
            text: "Text",
            fontFamily: "Arial",
            fontSize: 72,
            fontWeight: 400,
            fontStyle: "normal",
            lineHeight: 1.2,
            letterSpacing: 0,
            textAlign: "center",
            verticalAlign: "middle",
            autoResize: "height",
            textCase: "normal",
            kerningPairs: true,
            ligatures: true,
            fill: "#ffffff",
            fillEnabled: true,
            stroke: null,
            strokeWidth: 0,
            strokePosition: "inside",
          };
        case "rectangle":
          return {
            id,
            name: "Rectangle",
            type: "rectangle",
            x: (project.width - 400) / 2,
            y: (project.height - 240) / 2,
            width: 400,
            height: 240,
            scaleX: 1,
            scaleY: 1,
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
            scaleX: 1,
            scaleY: 1,
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
            scaleX: 1,
            scaleY: 1,
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
            scaleX: 1,
            scaleY: 1,
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
    setInspectorScope("layer");
    handleSceneChange({
      ...scene,
      layers: [...scene.layers, layer],
    });
  }

  const handleSelectedLayerPatch = useCallback(
    (patch: EditableLayerPatch) => {
      if (!scene || !selectedLayerId) {
        return;
      }

      const patchKeys = Object.keys(patch);

      if (patchKeys.length === 0) {
        return;
      }

      let changed = false;

      const updatedLayers: Layer[] = scene.layers.map((layer) => {
        if (layer.id !== selectedLayerId) {
          return layer;
        }

        const layerRecord = layer as unknown as Record<string, unknown>;
        const patchRecord = patch as Record<string, unknown>;
        const hasChanged = patchKeys.some(
          (key) => layerRecord[key] !== patchRecord[key],
        );

        if (!hasChanged) {
          return layer;
        }

        changed = true;

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

  const handleSelectedLayerAnimationsChange = useCallback(
    (animations: LayerAnimation[]) => {
      if (!scene || !selectedLayerId) {
        return;
      }

      let changed = false;

      const updatedLayers = scene.layers.map((layer) => {
        if (layer.id !== selectedLayerId) {
          return layer;
        }

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
    [handleSceneChange, scene, selectedLayerId],
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
      setInspectorScope(nextScope);
      return;
    }

    if (isDirty || isSceneLoading || isSaving) {
      return;
    }

    setIsSceneLoading(true);
    setSceneError(null);

    try {
      const loadedScene = await fetchScene(project.id, sceneId);

      setScene(loadedScene);
      setScenesById((current) => ({
        ...current,
        [loadedScene.id]: loadedScene,
      }));
      setSelectedLayerIds(nextSelectedLayerIds);
      setInspectorScope(nextScope);
      setIsDirty(false);
      clearHistory();
      setSaveError(null);
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

    setSelectedLayerIds((currentLayerIds) => {
      if (!additive) {
        return currentLayerIds.length === 1 && currentLayerIds[0] === layerId
          ? currentLayerIds
          : [layerId];
      }

      return currentLayerIds.includes(layerId)
        ? currentLayerIds.filter((candidate) => candidate !== layerId)
        : [...currentLayerIds, layerId];
    });
    setInspectorScope("layer");
  }

  async function handleSave(): Promise<void> {
    if (!project || !scene || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const [savedProject, savedScene] = await Promise.all([
        saveProject(project),
        saveScene(project.id, scene),
      ]);

      setProject(savedProject);
      setScene(savedScene);
      setScenesById((current) => ({
        ...current,
        [savedScene.id]: savedScene,
      }));
      setIsDirty(false);
      clearHistory();
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddScene(): Promise<void> {
    if (!project || isCreatingScene) {
      return;
    }

    if (isDirty) {
      setCreateSceneError("Save the current scene before adding a new scene");
      return;
    }

    setIsCreatingScene(true);
    setCreateSceneError(null);
    setSceneError(null);

    recordHistory();
    try {
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
      setIsDirty(false);
      setSaveError(null);
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

  const selectedLayer: Layer | null = scene
    ? (scene.layers.find((layer) => layer.id === selectedLayerId) ?? null)
    : null;

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
    ? "Saving changes…"
    : isDirty
      ? "Unsaved changes"
      : "All changes saved";

  return (
    <main className="editor-app">
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
          {saveError ? (
            <span className="toolbar-error">Save failed: {saveError}</span>
          ) : null}
          {createSceneError ? (
            <span className="toolbar-error">{createSceneError}</span>
          ) : null}
          <span className={`save-status${isDirty ? " is-dirty" : ""}`}>
            <span className="status-dot" />
            {saveStatus}
          </span>
          <EditorToolbar
            isSaving={isSaving}
            isSaveDisabled={!isDirty || isSaving}
            isAddSceneDisabled={!project || isDirty || isSaving || isCreatingScene}
            isCreatingScene={isCreatingScene}
            onAddText={() => handleAddLayer("text")}
            onAddRectangle={() => handleAddLayer("rectangle")}
            onAddCircle={() => handleAddLayer("circle")}
            onAddTriangle={() => handleAddLayer("triangle")}
            onAddArrow={() => handleAddLayer("arrow")}
            onAddScene={() => void handleAddScene()}
            onOpenPreview={handleOpenPreview}
            onSave={() => void handleSave()}
          />
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="sidebar sidebar-left">
          <SceneLayerTree
            sceneReferences={project.scenes}
            scenesById={scenesForTree}
            currentSceneId={scene.id}
            selectedLayerIds={selectedLayerIds}
            inspectorScope={inspectorScope}
            isSceneSwitchDisabled={isDirty || isSceneLoading || isSaving}
            onSceneSelect={(sceneId) => void handleSceneSelect(sceneId)}
            onLayerSelect={handleTreeLayerSelect}
            onLayerStateChange={handleLayerStateChange}
          />
        </aside>

        <section className="canvas-workspace" aria-label="Fabric editor">
          <AlignmentToolbar
            selectionCount={selectedLayerIds.length}
            onAlign={handleAlign}
          />
          <div className="canvas-stage">
            <div className="canvas-frame">
              <FabricSceneCanvas
                scene={scene}
                projectWidth={project.width}
                projectHeight={project.height}
                displayScale={0.5}
                onSceneChange={handleSceneChange}
                onSelectedLayerIdsChange={handleSelectedLayerIdsChange}
                selectedLayerIds={selectedLayerIds}
              />
            </div>
          </div>
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
                <p className="app-stage multiple-selection-message">
                  Multiple layers selected: {selectedLayerIds.length}
                </p>
              ) : (
                <LayerPropertiesPanel
                  layer={selectedLayer}
                  selectionCount={selectedLayerIds.length}
                  onPatch={handleSelectedLayerPatch}
                  onAlign={handleAlign}
                />
              )
            ) : inspectorScope === "scene" ? (
              <p className="app-stage scene-animations-message">
                Scene animations are not supported yet.
              </p>
            ) : selectedLayerIds.length > 1 ? (
              <p className="app-stage multiple-selection-message">
                Select one layer to edit animations.
              </p>
            ) : (
              <LayerAnimationPanel
                layer={selectedLayer}
                sceneDurationInFrames={scene.durationInFrames}
                onAnimationsChange={handleSelectedLayerAnimationsChange}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

export default App;
