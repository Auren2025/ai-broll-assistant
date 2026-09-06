import { useCallback } from "react";
import {
  canFlattenGroup,
  cloneLayersToTop,
  deleteLayers,
  duplicateSelectedLayers,
  findLayerById,
  getAllLayers,
  insertLayerIntoGroup,
  makeGroup,
  moveLayerTo,
  reorderSelectedLayersZIndex,
  ungroupLayer,
  type ZOrderAction,
} from "../domain/groupOperations";
import { getNextLayerId, makeLayerIdGenerator } from "../domain/layerIds";
import type { AtomicLayer } from "../domain/atomicLayerSchema";
import type { Project } from "../domain/projectSchema";
import type { Layer, Scene } from "../domain/sceneSchema";
import { DEFAULT_SHAPE_TEXT } from "../domain/shapeTextSchema";
import { alignSceneLayers, type AlignmentAction } from "./alignment";
import { measureNaturalTextSize } from "./textMetrics";

export type AddableLayerType = "text" | "rectangle" | "circle" | "triangle" | "arrow";

interface LayerSelectionState {
  scene: Scene | null;
  selectedLayerIds: string[];
  inspectorScope: "scene" | "layer";
  activeInsertionGroupId: string | null;
}

interface LayerCommandState {
  selection: LayerSelectionState;
  project: Project | null;
  isUploadingImage: boolean;
  sceneOperationRunning: boolean;
  isApplyingHistory: boolean;
}

interface LayerCommandRefs {
  clipboardLayersRef: { current: Layer[] | null };
  replaceImageTargetIdRef: { current: string | null };
  sceneRef: { current: Scene | null };
}

interface LayerCommandSetters {
  setSelectedLayerIds: (ids: string[]) => void;
  setSelectedAnimationId: (value: string | null) => void;
  setInspectorScope: (scope: "scene" | "layer") => void;
  setActiveInsertionGroupId: (value: string | null | ((current: string | null) => string | null)) => void;
  setContextMenu: (menu: { x: number; y: number } | null) => void;
  setSceneError: (message: string | null) => void;
  setPendingTextEditLayerId: (value: string | null) => void;
  setImageUploadError: (message: string | null) => void;
}

interface LayerCommandHandlers {
  handleSceneChange: (updatedScene: Scene) => void;
  handleProjectChange?: (updatedProject: Project) => void;
  getErrorMessage: (error: unknown) => string;
}

export interface UseLayerCommandsOptions {
  state: LayerCommandState;
  refs: LayerCommandRefs;
  setters: LayerCommandSetters;
  handlers: LayerCommandHandlers;
}

export interface LayerCommands {
  deleteSelection: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  reorderSelection: (action: ZOrderAction) => void;
  align: (action: AlignmentAction) => void;
  addLayer: (type: AddableLayerType) => void;
  addImagePlaceholder: () => void;
  buildImagePlaceholder: (scene: Scene, id: string) => AtomicLayer;
  measureTextBounds: typeof measureNaturalTextSize;
}

const DEFAULT_IMAGE_PLACEHOLDER_WIDTH = 640;
const DEFAULT_IMAGE_PLACEHOLDER_HEIGHT = 360;

function buildImagePlaceholderLayer(project: Project, scene: Scene, id: string): AtomicLayer {
  const zIndex = Math.max(-1, ...scene.layers.map((layer) => layer.zIndex)) + 1;
  const width = Math.min(DEFAULT_IMAGE_PLACEHOLDER_WIDTH, project.width);
  const height = Math.min(DEFAULT_IMAGE_PLACEHOLDER_HEIGHT, project.height);
  return {
    id,
    name: "Image placeholder",
    type: "image",
    x: (project.width - width) / 2,
    y: (project.height - height) / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    src: null,
    fit: "contain",
    placeholderColor: "#d1d5db",
    cornerRadius: 0,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
  };
}

function buildTextLayer(project: Project, id: string, zIndex: number): AtomicLayer {
  const textDefaults = {
    text: "Text",
    fontFamily: "Arial",
    fontSize: 72,
    fontWeight: 400,
    fontStyle: "normal" as const,
    lineHeight: 1.2,
    letterSpacing: 0,
  };
  const dims = measureNaturalTextSize(textDefaults.text, {
    fontFamily: textDefaults.fontFamily,
    fontSize: textDefaults.fontSize,
    fontWeight: textDefaults.fontWeight,
    fontStyle: textDefaults.fontStyle,
    lineHeight: textDefaults.lineHeight,
    letterSpacing: textDefaults.letterSpacing,
  });
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

function buildShapeLayer(
  type: "rectangle" | "circle" | "triangle" | "arrow",
  project: Project,
  id: string,
  zIndex: number,
): AtomicLayer {
  switch (type) {
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
        shapeText: { ...DEFAULT_SHAPE_TEXT },
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
        shapeText: { ...DEFAULT_SHAPE_TEXT },
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
}

export function useLayerCommands(options: UseLayerCommandsOptions): LayerCommands {
  const { state, refs, setters, handlers } = options;
  const { selection, project, isUploadingImage, sceneOperationRunning, isApplyingHistory } = state;

  const buildImagePlaceholder = useCallback(
    (scene: Scene, id: string) => {
      if (!project) throw new Error("Project is required for image placeholders");
      return buildImagePlaceholderLayer(project, scene, id);
    },
    [project],
  );

  const commitNewLayer = useCallback(
    (layer: AtomicLayer) => {
      const { scene } = selection;
      if (!scene) return;
      const groupedScene = selection.activeInsertionGroupId
        ? insertLayerIntoGroup(scene, selection.activeInsertionGroupId, layer)
        : null;
      if (selection.activeInsertionGroupId && !groupedScene) {
        setters.setActiveInsertionGroupId(null);
      }
      handlers.handleSceneChange(
        groupedScene ?? { ...scene, layers: [...scene.layers, layer] },
      );
      setters.setSelectedLayerIds([layer.id]);
      setters.setSelectedAnimationId(null);
      setters.setInspectorScope("layer");
    },
    [handlers, selection, setters],
  );

  const deleteSelection = useCallback(() => {
    const { scene, selectedLayerIds, inspectorScope, activeInsertionGroupId } = selection;
    if (!scene) return;
    if (inspectorScope === "layer") {
      if (selectedLayerIds.length === 0) return;
      handlers.handleSceneChange(deleteLayers(scene, selectedLayerIds));
      if (activeInsertionGroupId && selectedLayerIds.includes(activeInsertionGroupId)) {
        setters.setActiveInsertionGroupId(null);
      }
      setters.setSelectedLayerIds([]);
      setters.setSelectedAnimationId(null);
      setters.setInspectorScope("scene");
    }
  }, [handlers, selection, setters]);

  const groupSelection = useCallback(() => {
    const { scene, selectedLayerIds } = selection;
    if (!scene) return;
    const groupId = getNextLayerId(scene.layers, "group");
    const groupNumber = Number(groupId.split("-").at(-1)) || 1;
    const updatedScene = makeGroup(scene, selectedLayerIds, groupId, `Group ${groupNumber}`);
    if (!updatedScene) return;
    handlers.handleSceneChange(updatedScene);
    setters.setSelectedLayerIds([groupId]);
    setters.setSelectedAnimationId(null);
    setters.setInspectorScope("layer");
    setters.setActiveInsertionGroupId(null);
    setters.setContextMenu(null);
  }, [handlers, selection, setters]);

  const ungroupSelection = useCallback(() => {
    const { scene, selectedLayerIds } = selection;
    if (!scene || selectedLayerIds.length !== 1) return;
    const groupId = selectedLayerIds[0];
    if (!groupId) return;
    const group = findLayerById(scene.layers, groupId);
    if (!group || group.type !== "group") return;
    if (!canFlattenGroup(group, true)) {
      setters.setSceneError("Remove the group opacity before ungrouping");
      setters.setContextMenu(null);
      return;
    }
    if (
      group.animations.length > 0 &&
      !window.confirm("Ungrouping will remove the group animation. Continue?")
    ) {
      setters.setContextMenu(null);
      return;
    }
    const updatedScene = ungroupLayer(scene, groupId, true);
    if (!updatedScene) return;
    handlers.handleSceneChange(updatedScene);
    setters.setActiveInsertionGroupId(null);
    setters.setSelectedLayerIds(group.children.map((child) => child.id));
    setters.setSelectedAnimationId(null);
    setters.setInspectorScope("layer");
    setters.setContextMenu(null);
  }, [handlers, selection, setters]);

  const duplicateSelection = useCallback(() => {
    const { scene, selectedLayerIds } = selection;
    if (!scene || selectedLayerIds.length === 0) return;
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
    if (targets.length !== selectedLayerIds.length) return;
    const generator = makeLayerIdGenerator(getAllLayers(scene.layers));
    const idByOriginal = new Map<Layer, string>();
    for (const target of targets) idByOriginal.set(target, generator(target));
    const newIdFor = (original: Layer): string =>
      idByOriginal.get(original) ?? generator(original);
    const updatedScene = duplicateSelectedLayers(scene, selectedLayerIds, newIdFor);
    if (updatedScene === scene) return;
    handlers.handleSceneChange(updatedScene);
    const newIds = targets
      .map((target) => idByOriginal.get(target))
      .filter((id): id is string => Boolean(id));
    setters.setSelectedLayerIds(newIds);
    setters.setActiveInsertionGroupId((current) => {
      if (!current) return null;
      const group = findLayerById(updatedScene.layers, current);
      if (!group || group.type !== "group") return null;
      return newIds.every((layerId) =>
        group.children.some((child) => child.id === layerId),
      )
        ? current
        : null;
    });
    setters.setSelectedAnimationId(null);
    setters.setInspectorScope("layer");
    setters.setContextMenu(null);
  }, [handlers, selection, setters]);

  const copySelection = useCallback(() => {
    const { scene, selectedLayerIds } = selection;
    if (!scene || selectedLayerIds.length === 0) return;
    const selectedIdSet = new Set(selectedLayerIds);
    const topLevel = scene.layers.filter((layer) => selectedIdSet.has(layer.id));
    if (topLevel.length === 0) return;
    refs.clipboardLayersRef.current = JSON.parse(JSON.stringify(topLevel)) as Layer[];
    setters.setContextMenu(null);
  }, [refs, selection, setters]);

  const pasteSelection = useCallback(() => {
    const { scene, activeInsertionGroupId } = selection;
    const clipboard = refs.clipboardLayersRef.current;
    if (!scene || !clipboard || clipboard.length === 0) return;
    const generator = makeLayerIdGenerator(getAllLayers(scene.layers));
    const idByOriginal = new Map<Layer, string>();
    for (const layer of clipboard) idByOriginal.set(layer, generator(layer));
    const newIdFor = (original: Layer): string =>
      idByOriginal.get(original) ?? generator(original);
    let updatedScene = cloneLayersToTop(scene, clipboard, newIdFor, 24, 24);
    if (updatedScene === scene) return;
    const newIds = clipboard
      .map((layer) => idByOriginal.get(layer))
      .filter((id): id is string => Boolean(id));
    const canPasteIntoActiveGroup =
      Boolean(activeInsertionGroupId) &&
      clipboard.every((layer) => layer.type !== "group");
    if (canPasteIntoActiveGroup && activeInsertionGroupId) {
      for (const newId of newIds) {
        const targetGroup = findLayerById(updatedScene.layers, activeInsertionGroupId);
        if (!targetGroup || targetGroup.type !== "group") break;
        const frontChild = [...targetGroup.children].sort(
          (first, second) => second.zIndex - first.zIndex,
        )[0];
        const movedScene = moveLayerTo(updatedScene, newId, {
          parentGroupId: activeInsertionGroupId,
          beforeLayerId: frontChild?.id ?? null,
        });
        if (!movedScene) break;
        updatedScene = movedScene;
      }
    }
    handlers.handleSceneChange(updatedScene);
    setters.setSelectedLayerIds(newIds);
    setters.setActiveInsertionGroupId((current) => {
      if (!current) return null;
      const group = findLayerById(updatedScene.layers, current);
      if (!group || group.type !== "group") return null;
      return newIds.every((layerId) =>
        group.children.some((child) => child.id === layerId),
      )
        ? current
        : null;
    });
    setters.setSelectedAnimationId(null);
    setters.setInspectorScope("layer");
    setters.setContextMenu(null);
  }, [handlers, refs, selection, setters]);

  const reorderSelection = useCallback(
    (action: ZOrderAction) => {
      const { scene, selectedLayerIds } = selection;
      if (!scene || selectedLayerIds.length === 0) return;
      const updatedScene = reorderSelectedLayersZIndex(scene, selectedLayerIds, action);
      if (updatedScene === scene) return;
      handlers.handleSceneChange(updatedScene);
    },
    [handlers, selection],
  );

  const align = useCallback(
    (action: AlignmentAction) => {
      const { scene, selectedLayerIds } = selection;
      if (!scene || !project) return;
      const updatedScene = alignSceneLayers(
        scene,
        selectedLayerIds,
        action,
        project.width,
        project.height,
      );
      if (updatedScene !== scene) handlers.handleSceneChange(updatedScene);
    },
    [handlers, project, selection],
  );

  const addLayer = useCallback(
    (type: AddableLayerType) => {
      const { scene } = selection;
      if (!scene || !project) return;
      const id = getNextLayerId(scene.layers, type);
      const zIndex = Math.max(-1, ...scene.layers.map((layer) => layer.zIndex)) + 1;
      const layer: AtomicLayer =
        type === "text"
          ? buildTextLayer(project, id, zIndex)
          : buildShapeLayer(type, project, id, zIndex);
      if (type === "text") setters.setPendingTextEditLayerId(layer.id);
      commitNewLayer(layer);
    },
    [commitNewLayer, project, selection, setters],
  );

  const addImagePlaceholder = useCallback(() => {
    const { scene } = selection;
    if (
      !project ||
      !scene ||
      isUploadingImage ||
      sceneOperationRunning ||
      isApplyingHistory
    ) {
      return;
    }
    const id = getNextLayerId(scene.layers, "image");
    const layer = buildImagePlaceholderLayer(project, scene, id);
    commitNewLayer(layer);
  }, [commitNewLayer, isApplyingHistory, isUploadingImage, project, sceneOperationRunning, selection]);

  return {
    deleteSelection,
    groupSelection,
    ungroupSelection,
    duplicateSelection,
    copySelection,
    pasteSelection,
    reorderSelection,
    align,
    addLayer,
    addImagePlaceholder,
    buildImagePlaceholder,
    measureTextBounds: measureNaturalTextSize,
  };
}