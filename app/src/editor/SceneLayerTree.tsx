import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { SceneReference } from "../domain/projectSchema";
import { moveSceneReference } from "../domain/sceneOrder";
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

function TreeNameEditor({ initialName, label, onCommit, onCancel }: {
  initialName: string;
  label: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialName);
  const finishedRef = useRef(false);

  function finish(commit: boolean): void {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (commit) {
      onCommit(draft);
    } else {
      onCancel();
    }
  }

  return (
    <input
      type="text"
      className="tree-rename-input"
      aria-label={label}
      maxLength={120}
      value={draft}
      autoFocus
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          finish(true);
        } else if (event.key === "Escape") {
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
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
  isSlideProject: boolean;
  onSceneSelect: (sceneId: string) => void;
  onSceneContextMenu: (sceneId: string, x: number, y: number) => void;
  onSceneMove: (sceneId: string, insertionIndex: number) => void;
  onSceneRename: (sceneId: string, name: string) => void;
  onLayerSelect: (sceneId: string, layerId: string, additive: boolean) => void;
  onLayerRename: (sceneId: string, layerId: string, name: string) => void;
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
  isSlideProject,
  onSceneSelect,
  onSceneContextMenu,
  onSceneMove,
  onSceneRename,
  onLayerSelect,
  onLayerRename,
  onLayerMove,
  onLayerStateChange,
}: SceneLayerTreeProps) {
  const [expandedSceneIds, setExpandedSceneIds] = useState<string[]>([
    currentSceneId,
  ]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [draggedLayer, setDraggedLayer] = useState<DraggedLayer | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [sceneDropTarget, setSceneDropTarget] = useState<{
    sceneId: string;
    side: "before" | "after";
  } | null>(null);
  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);
  const [renamingLayer, setRenamingLayer] = useState<{
    sceneId: string;
    layerId: string;
  } | null>(null);

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

  function sceneDropSide(event: DragEvent<HTMLElement>): "before" | "after" {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function endSceneDrag(): void {
    setDraggedSceneId(null);
    setSceneDropTarget(null);
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
          {renamingLayer?.sceneId === sceneId &&
          renamingLayer?.layerId === layer.id ? (
            <div className="layer-item-main is-renaming">
              <TreeNameEditor
                key={layer.id}
                initialName={layer.name}
                label="Layer name"
                onCommit={(name) => {
                  setRenamingLayer(null);
                  onLayerRename(sceneId, layer.id, name);
                }}
                onCancel={() => setRenamingLayer(null)}
              />
            </div>
          ) : (
            <button
              className="layer-item-main"
              type="button"
              aria-pressed={isSelected}
              title="Double-click to rename"
              disabled={
                (!isCurrent && isSceneSwitchDisabled) || effectivelyLocked
              }
              onClick={(event) => handleLayerClick(event, sceneId, layer.id)}
              onDoubleClick={() => {
                if (!isCurrent || renamingLayer || renamingSceneId) return;
                setRenamingLayer({ sceneId, layerId: layer.id });
              }}
            >
              <span className={`layer-icon layer-icon-${layer.type}`}>
                {getLayerIcon(layer.type)}
              </span>
              <strong className="layer-type-name">{layer.name}</strong>
            </button>
          )}
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
        <h2>{isSlideProject ? "Pages" : "Scenes"}</h2>
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
                className={`scene-tree-row${isCurrent ? " is-current" : ""}${isSceneSelected ? " is-scene-selected" : ""}${isSlideProject ? " is-slide" : ""}${draggedSceneId === sceneReference.id ? " is-dragging" : ""}${sceneDropTarget?.sceneId === sceneReference.id ? ` is-drop-${sceneDropTarget.side}` : ""}`}
                draggable={isSlideProject && !isSceneSwitchDisabled}
                onDragStart={(event) => {
                  if (!isSlideProject || isSceneSwitchDisabled) return;
                  setDraggedSceneId(sceneReference.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", sceneReference.id);
                }}
                onDragEnd={endSceneDrag}
                onDragOver={(event) => {
                  if (!draggedSceneId || !isSlideProject || isSceneSwitchDisabled) return;
                  const side = sceneDropSide(event);
                  const insertionIndex = index + (side === "after" ? 1 : 0);
                  if (!moveSceneReference(sceneReferences, draggedSceneId, insertionIndex)) {
                    setSceneDropTarget(null);
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setSceneDropTarget((current) =>
                    current?.sceneId === sceneReference.id && current.side === side
                      ? current
                      : { sceneId: sceneReference.id, side },
                  );
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setSceneDropTarget((current) => current?.sceneId === sceneReference.id ? null : current);
                  }
                }}
                onDrop={(event) => {
                  if (!draggedSceneId || !isSlideProject || isSceneSwitchDisabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const insertionIndex = index + (sceneDropSide(event) === "after" ? 1 : 0);
                  onSceneMove(draggedSceneId, insertionIndex);
                  endSceneDrag();
                }}
                onContextMenu={(event) => {
                  if (!isSlideProject || isSceneSwitchDisabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSceneContextMenu(sceneReference.id, event.clientX, event.clientY);
                }}
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
                {renamingSceneId === sceneReference.id ? (
                  <div className="scene-tree-main is-renaming">
                    <span className="scene-number">{index + 1}</span>
                    <TreeNameEditor
                      key={sceneReference.id}
                      initialName={scene?.name ?? ""}
                      label="Scene name"
                      onCommit={(name) => {
                        setRenamingSceneId(null);
                        onSceneRename(sceneReference.id, name);
                      }}
                      onCancel={() => setRenamingSceneId(null)}
                    />
                    {isCurrent ? <span className="current-marker" /> : null}
                  </div>
                ) : (
                  <button
                    className="scene-tree-main"
                    type="button"
                    aria-current={isCurrent ? "page" : undefined}
                    disabled={isSceneSwitchDisabled}
                    onClick={() => onSceneSelect(sceneReference.id)}
                    onDoubleClick={() => {
                      if (isSceneSwitchDisabled || renamingSceneId) return;
                      setRenamingSceneId(sceneReference.id);
                    }}
                  >
                    <span className="scene-number">{index + 1}</span>
                    <span className="scene-copy" title="Double-click to rename">
                      <strong>
                        {scene?.name ?? `${isSlideProject ? "Page" : "Scene"} ${index + 1}`}
                      </strong>
                    </span>
                    {isCurrent ? <span className="current-marker" /> : null}
                  </button>
                )}
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
