import { useEffect, useState, type MouseEvent } from "react";
import type { SceneReference } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";

interface SceneLayerTreeProps {
  sceneReferences: readonly SceneReference[];
  scenesById: Readonly<Record<string, Scene>>;
  currentSceneId: string;
  selectedLayerIds: readonly string[];
  isSceneSwitchDisabled: boolean;
  onSceneSelect: (sceneId: string) => void;
  onLayerSelect: (sceneId: string, layerId: string, additive: boolean) => void;
}

export function SceneLayerTree({
  sceneReferences,
  scenesById,
  currentSceneId,
  selectedLayerIds,
  isSceneSwitchDisabled,
  onSceneSelect,
  onLayerSelect,
}: SceneLayerTreeProps) {
  const [expandedSceneIds, setExpandedSceneIds] = useState<string[]>([
    currentSceneId,
  ]);

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
          const sortedLayers = scene
            ? [...scene.layers].sort(
                (first, second) => second.zIndex - first.zIndex,
              )
            : [];

          return (
            <div className="scene-tree-node" key={sceneReference.id}>
              <div className={`scene-tree-row${isCurrent ? " is-current" : ""}`}>
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
                  disabled={isCurrent || isSceneSwitchDisabled}
                  onClick={() => onSceneSelect(sceneReference.id)}
                >
                  <span className="scene-number">{index + 1}</span>
                  <span className="scene-copy">
                    <strong>{sceneReference.id}</strong>
                    <small>{scene?.topic ?? "Loading scene…"}</small>
                  </span>
                  {isCurrent ? <span className="current-marker" /> : null}
                </button>
              </div>

              {isExpanded ? (
                <div className="tree-children" aria-label={`${sceneReference.id} layers`}>
                  {sortedLayers.map((layer) => {
                    const isSelected =
                      isCurrent && selectedLayerIds.includes(layer.id);

                    return (
                      <button
                        className={`layer-item${isSelected ? " is-selected" : ""}`}
                        key={layer.id}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!isCurrent && isSceneSwitchDisabled}
                        onClick={(event) =>
                          handleLayerClick(
                            event,
                            sceneReference.id,
                            layer.id,
                          )
                        }
                      >
                        <span className={`layer-icon layer-icon-${layer.type}`}>
                          {layer.type === "text" ? "T" : "□"}
                        </span>
                        <span className="layer-copy">
                          <strong>{layer.name}</strong>
                          <small>{layer.type}</small>
                        </span>
                        <span className="layer-index">{layer.zIndex}</span>
                      </button>
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
