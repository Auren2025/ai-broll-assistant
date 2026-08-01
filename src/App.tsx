import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { fetchProject, fetchScene, saveScene } from "./api/projectApi";
import type { LayerAnimation } from "./domain/layerAnimationSchema";
import type { Project } from "./domain/projectSchema";
import type { Layer, Scene } from "./domain/sceneSchema";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { LayerAnimationPanel } from "./editor/LayerAnimationPanel";
import {
  LayerPropertiesPanel,
  type EditableLayerPatch,
} from "./editor/LayerPropertiesPanel";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./preview/previewChannel";

const PROJECT_ID = "video001";

type InspectorTab = "design" | "animate";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const previewStateRef = useRef<PreviewStateMessage | null>(null);

  previewStateRef.current =
    project && scene
      ? {
          type: "state",
          project,
          scene,
          isDirty,
        }
      : null;

  useEffect(() => {
    let cancelled = false;

    async function loadProject(): Promise<void> {
      try {
        const loadedProject = await fetchProject(PROJECT_ID);
        const firstSceneReference = loadedProject.scenes[0];

        if (!firstSceneReference) {
          throw new Error("Project contains no scenes");
        }

        const loadedScene = await fetchScene(
          loadedProject.id,
          firstSceneReference.id,
        );

        if (!cancelled) {
          setProject(loadedProject);
          setScene(loadedScene);
          setSelectedLayerId(null);
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

  const handleSceneChange = useCallback((updatedScene: Scene) => {
    setScene(updatedScene);
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const handleSelectedLayerPatch = useCallback(
    (patch: EditableLayerPatch) => {
      if (!scene || !selectedLayerId) {
        return;
      }

      const patchKeys = Object.keys(patch) as (keyof EditableLayerPatch)[];

      if (patchKeys.length === 0) {
        return;
      }

      let changed = false;

      const updatedLayers = scene.layers.map((layer) => {
        if (layer.id !== selectedLayerId) {
          return layer;
        }

        if ("text" in patch) {
          if (layer.type !== "text" || layer.text === patch.text) {
            return layer;
          }

          changed = true;

          return {
            ...layer,
            text: patch.text,
          };
        }

        const hasChanged = patchKeys.some(
          (key) => layer[key] !== patch[key],
        );

        if (!hasChanged) {
          return layer;
        }

        changed = true;

        return {
          ...layer,
          ...patch,
        };
      });

      if (!changed) {
        return;
      }

      setScene({
        ...scene,
        layers: updatedLayers,
      });

      setIsDirty(true);
      setSaveError(null);
    },
    [scene, selectedLayerId],
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

      setScene({
        ...scene,
        layers: updatedLayers,
      });

      setIsDirty(true);
      setSaveError(null);
    },
    [scene, selectedLayerId],
  );

  async function handleSceneSelect(sceneId: string): Promise<void> {
    if (
      !project ||
      sceneId === scene?.id ||
      isDirty ||
      isSceneLoading ||
      isSaving
    ) {
      return;
    }

    setIsSceneLoading(true);
    setSceneError(null);

    try {
      const loadedScene = await fetchScene(project.id, sceneId);

      setScene(loadedScene);
      setSelectedLayerId(null);
      setIsDirty(false);
      setSaveError(null);
    } catch (error: unknown) {
      setSceneError(getErrorMessage(error));
    } finally {
      setIsSceneLoading(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!project || !scene || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const savedScene = await saveScene(project.id, scene);

      setScene(savedScene);
      setIsDirty(false);
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
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

  const sortedLayers: Layer[] = scene
    ? [...scene.layers].sort((first, second) => second.zIndex - first.zIndex)
    : [];

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
          <span className={`save-status${isDirty ? " is-dirty" : ""}`}>
            <span className="status-dot" />
            {saveStatus}
          </span>
          <button
            className="button-secondary"
            type="button"
            onClick={handleOpenPreview}
          >
            Open Preview
          </button>
          <button
            className="button-primary"
            type="button"
            disabled={!isDirty || isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="sidebar sidebar-left">
          <section className="sidebar-section">
            <div className="section-heading">
              <h2>Scenes</h2>
              <span>{project.scenes.length}</span>
            </div>
            <nav className="scene-list" aria-label="Scenes">
              {project.scenes.map((sceneReference, index) => {
                const isCurrent = sceneReference.id === scene.id;

                return (
                  <button
                    className={`scene-item${isCurrent ? " is-current" : ""}`}
                    key={sceneReference.id}
                    type="button"
                    aria-current={isCurrent ? "page" : undefined}
                    disabled={
                      isCurrent || isDirty || isSceneLoading || isSaving
                    }
                    onClick={() => void handleSceneSelect(sceneReference.id)}
                  >
                    <span className="scene-number">{index + 1}</span>
                    <span className="scene-copy">
                      <strong>{sceneReference.id}</strong>
                      <small>{isCurrent ? scene.topic : "Scene"}</small>
                    </span>
                    {isCurrent ? <span className="current-marker" /> : null}
                  </button>
                );
              })}
            </nav>
            {isDirty ? (
              <p className="sidebar-hint">Save before switching scenes.</p>
            ) : null}
          </section>

          <section className="sidebar-section layer-section">
            <div className="section-heading">
              <h2>Layers</h2>
              <span>{scene.layers.length}</span>
            </div>
            <div className="layer-list" aria-label="Layers">
              {sortedLayers.map((layer) => {
                const isSelected = layer.id === selectedLayerId;

                return (
                  <button
                    className={`layer-item${isSelected ? " is-selected" : ""}`}
                    key={layer.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedLayerId(isSelected ? null : layer.id)
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
          </section>
        </aside>

        <section className="canvas-workspace" aria-label="Fabric editor">
          <div className="canvas-stage">
            <div className="canvas-frame">
              <FabricSceneCanvas
                scene={scene}
                projectWidth={project.width}
                projectHeight={project.height}
                displayScale={0.5}
                onSceneChange={handleSceneChange}
                onSelectedLayerChange={setSelectedLayerId}
                selectedLayerId={selectedLayerId}
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
            <div className="selection-summary">
              <span>Selected layer</span>
              <strong>{selectedLayer?.name ?? "None"}</strong>
              {selectedLayer ? <small>{selectedLayer.type}</small> : null}
            </div>

            {inspectorTab === "design" ? (
              <LayerPropertiesPanel
                layer={selectedLayer}
                onPatch={handleSelectedLayerPatch}
              />
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
