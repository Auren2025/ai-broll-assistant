import {
  useEffect,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { SceneReference } from "../domain/projectSchema";
import type { Layer, Scene } from "../domain/sceneSchema";

type InspectorScope = "scene" | "layer";

function getLayerIcon(type: Layer["type"]): string {
  switch (type) {
    case "text":
      return "T";
    case "image":
      return "▣";
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

interface DraggedLayer {
  sceneId: string;
  layerId: string;
  type: Layer["type"];
  parentGroupId: string | null;
}

export interface LayerMoveRequest {
  layerId: string;
  parentGroupId: string | null;
  beforeLayerId: string | null;
}

interface SceneLayerTreeProps {
  sceneReferences: readonly SceneReference[];
  scenesById: Readonly<Record<string, Scene>>;
  currentSceneId: string;
  selectedLayerIds: readonly string[];
  hoveredLayerId: string | null;
  activeInsertionGroupId: string | null;
  inspectorScope: InspectorScope;
  isSceneSwitchDisabled: boolean;
  onSceneSelect: (sceneId: string) => void;
  onLayerSelect: (sceneId: string, layerId: string, additive: boolean) => void;
  onGroupEditEnter: (sceneId: string, groupId: string) => void;
  onLayerMove: (sceneId: string, request: LayerMoveRequest) => void;
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
  hoveredLayerId,
  activeInsertionGroupId,
  inspectorScope,
  isSceneSwitchDisabled,
  onSceneSelect,
  onLayerSelect,
  onGroupEditEnter,
  onLayerMove,
  onLayerStateChange,
}: SceneLayerTreeProps) {
  const [expandedSceneIds, setExpandedSceneIds] = useState<string[]>([
    currentSceneId,
  ]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [draggedLayer, setDraggedLayer] = useState<DraggedLayer | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);

  useEffect(() => {
    setExpandedSceneIds((current) =>
      current.includes(currentSceneId)
        ? current
        : [...current, currentSceneId],
    );
  }, [currentSceneId]);

  useEffect(() => {
    if (!activeInsertionGroupId) return;
    setExpandedGroupIds((current) =>
      current.includes(activeInsertionGroupId)
        ? current
        : [...current, activeInsertionGroupId],
    );
  }, [activeInsertionGroupId]);

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

  function beginLayerDrag(
    event: DragEvent<HTMLDivElement>,
    source: DraggedLayer,
  ): void {
    setDraggedLayer(source);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", source.layerId);
  }

  function endLayerDrag(): void {
    setDraggedLayer(null);
    setActiveDropTarget(null);
  }

  function canDropAt(
    sceneId: string,
    parentGroupId: string | null,
    beforeLayerId: string | null,
  ): boolean {
    if (!draggedLayer || draggedLayer.sceneId !== sceneId) return false;
    if (parentGroupId && draggedLayer.type === "group") return false;
    if (beforeLayerId === draggedLayer.layerId) return false;
    return true;
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    sceneId: string,
    parentGroupId: string | null,
    beforeLayerId: string | null,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    if (!canDropAt(sceneId, parentGroupId, beforeLayerId) || !draggedLayer) {
      endLayerDrag();
      return;
    }
    onLayerMove(sceneId, {
      layerId: draggedLayer.layerId,
      parentGroupId,
      beforeLayerId,
    });
    if (parentGroupId) {
      setExpandedGroupIds((current) =>
        current.includes(parentGroupId) ? current : [...current, parentGroupId],
      );
    }
    endLayerDrag();
  }

  function dropZone(
    sceneId: string,
    parentGroupId: string | null,
    beforeLayerId: string | null,
  ): ReactNode {
    const key = `${sceneId}:${parentGroupId ?? "root"}:${beforeLayerId ?? "end"}`;
    const enabled = canDropAt(sceneId, parentGroupId, beforeLayerId);
    return (
      <div
        className={`layer-drop-zone${activeDropTarget === key ? " is-active" : ""}`}
        onDragEnter={(event) => {
          if (!enabled) return;
          event.preventDefault();
          setActiveDropTarget(key);
        }}
        onDragOver={(event) => {
          if (!enabled) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setActiveDropTarget((current) => (current === key ? null : current));
          }
        }}
        onDrop={(event) =>
          handleDrop(event, sceneId, parentGroupId, beforeLayerId)
        }
      />
    );
  }

  function layerRow(
    sceneId: string,
    layer: Layer,
    isCurrent: boolean,
    parentGroup: Extract<Layer, { type: "group" }> | null,
  ): ReactNode {
    const isSelected = isCurrent && selectedLayerIds.includes(layer.id);
    const isHovered = isCurrent && hoveredLayerId === layer.id;
    const isGroup = layer.type === "group";
    const isGroupExpanded = isGroup && expandedGroupIds.includes(layer.id);
    const effectivelyLocked = layer.locked || Boolean(parentGroup?.locked);
    const isInsertionTarget = isGroup && activeInsertionGroupId === layer.id;
    const canDrag = isCurrent && !effectivelyLocked;
    const groupDropKey = `${sceneId}:group:${layer.id}`;
    const canEnterGroup =
      isGroup &&
      isCurrent &&
      !layer.locked &&
      Boolean(draggedLayer) &&
      draggedLayer?.sceneId === sceneId &&
      draggedLayer?.type !== "group" &&
      draggedLayer?.layerId !== layer.id;

    return (
      <div className="layer-tree-entry" key={layer.id}>
        <div
          className={`layer-item${isGroup ? " is-group" : ""}${parentGroup ? " is-group-child" : ""}${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}${isInsertionTarget ? " is-insertion-target" : ""}${activeDropTarget === groupDropKey ? " is-group-drop-target" : ""}`}
          draggable={canDrag}
          onDragStart={(event) =>
            beginLayerDrag(event, {
              sceneId,
              layerId: layer.id,
              type: layer.type,
              parentGroupId: parentGroup?.id ?? null,
            })
          }
          onDragEnd={endLayerDrag}
          onDragEnter={(event) => {
            if (!canEnterGroup) return;
            event.preventDefault();
            event.stopPropagation();
            setActiveDropTarget(groupDropKey);
          }}
          onDragOver={(event) => {
            if (!canEnterGroup) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setActiveDropTarget((current) =>
                current === groupDropKey ? null : current,
              );
            }
          }}
          onDrop={(event) => {
            if (!canEnterGroup || layer.type !== "group") return;
            const firstChild = [...layer.children].sort(
              (first, second) => second.zIndex - first.zIndex,
            )[0];
            handleDrop(event, sceneId, layer.id, firstChild?.id ?? null);
          }}
        >
          {isGroup ? (
            <button
              className="layer-group-toggle"
              type="button"
              aria-label={`${isGroupExpanded ? "Collapse" : "Expand"} ${layer.name}`}
              aria-expanded={isGroupExpanded}
              onClick={() => toggleGroup(layer.id)}
            >
              {isGroupExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="layer-toggle-spacer" aria-hidden="true" />
          )}
          <button
            className="layer-item-main"
            type="button"
            aria-pressed={isSelected}
            disabled={
              (!isCurrent && isSceneSwitchDisabled) || effectivelyLocked
            }
            onClick={(event) => handleLayerClick(event, sceneId, layer.id)}
            onDoubleClick={
              isGroup ? () => onGroupEditEnter(sceneId, layer.id) : undefined
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
            disabled={!isCurrent || Boolean(parentGroup?.locked)}
            onClick={() =>
              onLayerStateChange(sceneId, layer.id, { locked: !layer.locked })
            }
          >
            <span aria-hidden="true" />
          </button>
          <button
            className={`layer-state-button layer-visibility-button${layer.visible ? " is-active" : ""}`}
            type="button"
            aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
            aria-pressed={layer.visible}
            disabled={!isCurrent || Boolean(parentGroup?.locked)}
            onClick={() =>
              onLayerStateChange(sceneId, layer.id, { visible: !layer.visible })
            }
          >
            <span aria-hidden="true" />
          </button>
        </div>
        {isGroup && isGroupExpanded ? (
          <div className="group-children" aria-label={`${layer.name} layers`}>
            {[...layer.children]
              .sort((first, second) => second.zIndex - first.zIndex)
              .map((child) => (
                <div className="group-child-entry" key={child.id}>
                  {dropZone(sceneId, layer.id, child.id)}
                  {layerRow(sceneId, child, isCurrent, layer)}
                </div>
              ))}
            {dropZone(sceneId, layer.id, null)}
          </div>
        ) : null}
      </div>
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
                className={`scene-tree-row${isCurrent ? " is-current" : ""}${isSceneSelected ? " is-scene-selected" : ""}`}
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
                  {sortedLayers.map((layer) => (
                    <div className="root-layer-entry" key={layer.id}>
                      {dropZone(sceneReference.id, null, layer.id)}
                      {layerRow(sceneReference.id, layer, isCurrent, null)}
                    </div>
                  ))}
                  {dropZone(sceneReference.id, null, null)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
