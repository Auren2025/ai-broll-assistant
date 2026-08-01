import { useEffect, useState, type MouseEvent } from "react";
import type { SceneReference } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";

type InspectorScope = "scene" | "layer";

function getLayerIcon(type: Scene["layers"][number]["type"]): string {
  switch (type) {
    case "text":
      return "T";
    case "circle":
      return "○";
    case "triangle":
      return "△";
    case "arrow":
      return "→";
    case "group":
      return "◇";
    default:
      return "□";
  }
}

interface SceneLayerTreeProps {
  sceneReferences: readonly SceneReference[];
  scenesById: Readonly<Record<string, Scene>>;
  currentSceneId: string;
  selectedLayerIds: readonly string[];
  inspectorScope: InspectorScope;
  isSceneSwitchDisabled: boolean;
  onSceneSelect: (sceneId: string) => void;
  onLayerSelect: (sceneId: string, layerId: string, additive: boolean) => void;
  onLayerStateChange: (
    sceneId: string,
    layerId: string,
    patch: { locked?: boolean; visible?: boolean },
  ) => void;
}

export function SceneLayerTree({
  sceneReferences,
  scenesById,
  currentSceneId,
  selectedLayerIds,
  inspectorScope,
  isSceneSwitchDisabled,
  onSceneSelect,
  onLayerSelect,
  onLayerStateChange,
}: SceneLayerTreeProps) {
  const [expandedSceneIds, setExpandedSceneIds] = useState<string[]>([
    currentSceneId,
  ]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedSceneIds((current) =>
      current.includes(currentSceneId)
        ? current
        : [...current, currentSceneId],
    );
  }, [currentSceneId]);

  function toggleScene(sceneId: string): void {
    setExpandedSceneIds((current) =>
      current.includes(sceneId)
        ? current.filter((candidate) => candidate !== sceneId)
        : [...current, sceneId],
    );
  }

  function handleLayerClick(
    event: MouseEvent<HTMLButtonElement>,
    sceneId: string,
    layerId: string,
  ): void {
    onLayerSelect(
      sceneId,
      layerId,
      event.shiftKey || event.metaKey || event.ctrlKey,
    );
  }

  function toggleGroup(groupId: string): void {
    setExpandedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((candidate) => candidate !== groupId)
        : [...current, groupId],
    );
  }

  return (
    <section className="scene-tree-section">
      <div className="section-heading">
        <h2>Scenes</h2>
        <span>{sceneReferences.length}</span>
      </div>
      <div className="scene-tree" aria-label="Scene layer tree">
        {sceneReferences.map((sceneReference, index) => {
          const scene = scenesById[sceneReference.id];
          const isCurrent = sceneReference.id === currentSceneId;
          const isExpanded = expandedSceneIds.includes(sceneReference.id);
          const isSceneSelected = isCurrent && inspectorScope === "scene";
          const sortedLayers = scene
            ? [...scene.layers].sort(
                (first, second) => second.zIndex - first.zIndex,
              )
            : [];

          return (
            <div className="scene-tree-node" key={sceneReference.id}>
              <div
                className={`scene-tree-row${isCurrent ? " is-current" : ""}${
                  isSceneSelected ? " is-scene-selected" : ""
                }`}
              >
                <button
                  className="tree-toggle"
                  type="button"
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${sceneReference.id}`}
                  aria-expanded={isExpanded}
                  onClick={() => toggleScene(sceneReference.id)}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
                <button
                  className="scene-tree-main"
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  disabled={isSceneSwitchDisabled}
                  onClick={() => onSceneSelect(sceneReference.id)}
                >
                  <span className="scene-number">{index + 1}</span>
                  <span className="scene-copy">
                    <strong>Scene {index + 1}</strong>
                  </span>
                  {isCurrent ? <span className="current-marker" /> : null}
                </button>
              </div>

              {isExpanded ? (
                <div className="tree-children" aria-label={`${sceneReference.id} layers`}>
                  {sortedLayers.map((layer) => {
                    const isSelected =
                      isCurrent && selectedLayerIds.includes(layer.id);
                    const isGroupExpanded =
                      layer.type === "group" && expandedGroupIds.includes(layer.id);

                    return (
                      <div className="layer-tree-entry" key={layer.id}>
                        <div
                          className={`layer-item${layer.type === "group" ? " is-group" : ""}${isSelected ? " is-selected" : ""}`}
                        >
                          {layer.type === "group" ? (
                            <button
                              className="layer-group-toggle"
                              type="button"
                              aria-label={`${isGroupExpanded ? "Collapse" : "Expand"} ${layer.name}`}
                              aria-expanded={isGroupExpanded}
                              onClick={() => toggleGroup(layer.id)}
                            >
                              {isGroupExpanded ? "▾" : "▸"}
                            </button>
                          ) : null}
                          <button
                            className="layer-item-main"
                            type="button"
                            aria-pressed={isSelected}
                            disabled={!isCurrent && isSceneSwitchDisabled}
                            onClick={(event) =>
                              handleLayerClick(event, sceneReference.id, layer.id)
                            }
                          >
                            <span className={`layer-icon layer-icon-${layer.type}`}>
                              {getLayerIcon(layer.type)}
                            </span>
                            <strong className="layer-type-name">{layer.name}</strong>
                          </button>
                          <button
                            className={`layer-state-button layer-lock-button${layer.locked ? " is-active" : ""}`}
                            type="button"
                            aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                            aria-pressed={layer.locked}
                            disabled={!isCurrent}
                            onClick={() => onLayerStateChange(sceneReference.id, layer.id, { locked: !layer.locked })}
                          ><span aria-hidden="true" /></button>
                          <button
                            className={`layer-state-button layer-visibility-button${layer.visible ? " is-active" : ""}`}
                            type="button"
                            aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                            aria-pressed={layer.visible}
                            disabled={!isCurrent}
                            onClick={() => onLayerStateChange(sceneReference.id, layer.id, { visible: !layer.visible })}
                          ><span aria-hidden="true" /></button>
                        </div>
                        {layer.type === "group" && isGroupExpanded ? (
                          <div className="group-children">
                            {[...layer.children]
                              .sort((first, second) => second.zIndex - first.zIndex)
                              .map((child) => {
                                const isChildSelected =
                                  isCurrent && selectedLayerIds.includes(child.id);
                                return (
                                  <div className={`layer-item is-group-child${isChildSelected ? " is-selected" : ""}`} key={child.id}>
                                    <button
                                      className="layer-item-main"
                                      type="button"
                                      aria-pressed={isChildSelected}
                                      disabled={!isCurrent || layer.locked || child.locked}
                                      onClick={(event) => handleLayerClick(event, sceneReference.id, child.id)}
                                    >
                                      <span className={`layer-icon layer-icon-${child.type}`}>{getLayerIcon(child.type)}</span>
                                      <strong className="layer-type-name">{child.name}</strong>
                                    </button>
                                    <button
                                      className={`layer-state-button layer-lock-button${child.locked ? " is-active" : ""}`}
                                      type="button"
                                      aria-label={`${child.locked ? "Unlock" : "Lock"} ${child.name}`}
                                      aria-pressed={child.locked}
                                      disabled={!isCurrent || layer.locked}
                                      onClick={() => onLayerStateChange(sceneReference.id, child.id, { locked: !child.locked })}
                                    ><span aria-hidden="true" /></button>
                                    <button
                                      className={`layer-state-button layer-visibility-button${child.visible ? " is-active" : ""}`}
                                      type="button"
                                      aria-label={`${child.visible ? "Hide" : "Show"} ${child.name}`}
                                      aria-pressed={child.visible}
                                      disabled={!isCurrent || layer.locked}
                                      onClick={() => onLayerStateChange(sceneReference.id, child.id, { visible: !child.visible })}
                                    ><span aria-hidden="true" /></button>
                                  </div>
                                );
                              })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {isSceneSwitchDisabled ? (
        <p className="sidebar-hint">Save before switching scenes.</p>
      ) : null}
    </section>
  );
}
