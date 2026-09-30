import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { findLayerById } from "../domain/groupOperations";
import type { Layer, Scene } from "../domain/sceneSchema";

export type InspectorScope = "scene" | "layer";

function findParentGroup(layers: readonly Layer[], layerId: string) {
  return layers.find((layer) => layer.type === "group" &&
    layer.children.some((child) => child.id === layerId));
}

function hasSameLayerIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((layerId) => second.includes(layerId));
}

interface SelectionOptions {
  scene: Scene | null;
  sceneRef: RefObject<Scene | null>;
  setSelectedLayerIds: Dispatch<SetStateAction<string[]>>;
  setActiveInsertionGroupId: Dispatch<SetStateAction<string | null>>;
  setSelectedAnimationId: Dispatch<SetStateAction<string | null>>;
  setInspectorScope: Dispatch<SetStateAction<InspectorScope>>;
  setInspectorTab: Dispatch<SetStateAction<"design" | "animate">>;
  selectScene: (sceneId: string, layerIds?: string[], scope?: InspectorScope) => Promise<Scene | null>;
}

export function useEditorSelection({
  scene, sceneRef, setSelectedLayerIds, setActiveInsertionGroupId,
  setSelectedAnimationId, setInspectorScope, setInspectorTab, selectScene,
}: SelectionOptions) {
  const onCanvasSelection = useCallback((layerIds: string[]) => {
    setSelectedLayerIds((current) => hasSameLayerIds(current, layerIds) ? current : layerIds);
    setSelectedAnimationId(null);
    setInspectorScope(layerIds.length > 0 ? "layer" : "scene");
    setActiveInsertionGroupId((current) => {
      if (!current || layerIds.length === 0) return null;
      const currentScene = sceneRef.current;
      const group = currentScene ? findLayerById(currentScene.layers, current) : null;
      if (!group || group.type !== "group") return null;
      return layerIds.every((id) => id === group.id || group.children.some((child) => child.id === id))
        ? current : null;
    });
  }, [sceneRef, setActiveInsertionGroupId, setInspectorScope, setSelectedAnimationId, setSelectedLayerIds]);

  const onGroupEditEnter = useCallback((groupId: string) => {
    const currentScene = sceneRef.current;
    const group = currentScene ? findLayerById(currentScene.layers, groupId) : null;
    if (!group || group.type !== "group" || group.locked) return;
    setActiveInsertionGroupId(groupId);
    setSelectedLayerIds([groupId]);
    setSelectedAnimationId(null);
    setInspectorScope("layer");
  }, [sceneRef, setActiveInsertionGroupId, setInspectorScope, setSelectedAnimationId, setSelectedLayerIds]);

  const onAnimationSelect = useCallback((layerId: string, animationId: string) => {
    const currentScene = sceneRef.current;
    if (currentScene && findParentGroup(currentScene.layers, layerId)) return;
    setActiveInsertionGroupId(null);
    setSelectedLayerIds([layerId]);
    setSelectedAnimationId(animationId);
    setInspectorScope("layer");
    setInspectorTab("animate");
  }, [sceneRef, setActiveInsertionGroupId, setInspectorScope, setInspectorTab, setSelectedAnimationId, setSelectedLayerIds]);

  function onTreeGroupEditEnter(sceneId: string, groupId: string): void {
    if (sceneId === scene?.id) {
      onGroupEditEnter(groupId);
      return;
    }
    void selectScene(sceneId, [groupId], "layer").then((didSelect) => {
      if (didSelect) setActiveInsertionGroupId(groupId);
    });
  }

  function onTreeLayerSelect(sceneId: string, layerId: string, additive: boolean): void {
    if (sceneId !== scene?.id) {
      void selectScene(sceneId, [layerId], "layer");
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
      return layerId === group.id || group.children.some((child) => child.id === layerId)
        ? current : null;
    });
    setSelectedLayerIds((current) => {
      if (!additive) return current.length === 1 && current[0] === layerId ? current : [layerId];
      if (current.includes(layerId)) return current.filter((candidate) => candidate !== layerId);
      const normalized = clickedLayer.type === "group"
        ? current.filter((candidate) => !clickedLayer.children.some((child) => child.id === candidate))
        : current.filter((candidate) => candidate !== parentGroup?.id);
      return [...normalized, layerId];
    });
    setInspectorScope("layer");
  }

  return { onCanvasSelection, onGroupEditEnter, onAnimationSelect, onTreeGroupEditEnter, onTreeLayerSelect };
}
