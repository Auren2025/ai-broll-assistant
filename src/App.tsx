import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchProject, fetchScene, saveScene } from "./api/projectApi";
import type { Project } from "./domain/projectSchema";
import type { Layer, Scene } from "./domain/sceneSchema";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";
import { RemotionScenePlayer } from "./remotion/RemotionScenePlayer";

const PROJECT_ID = "video001";

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

  const handleSceneChange = useCallback((updatedScene: Scene) => {
    setScene(updatedScene);
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const handleOpacityChange = useCallback(
    (opacity: number) => {
      if (!scene || !selectedLayerId || !Number.isFinite(opacity)) {
        return;
      }

      const normalizedOpacity = Math.min(1, Math.max(0, opacity));

      setScene({
        ...scene,
        layers: scene.layers.map((layer) =>
          layer.id === selectedLayerId
            ? {
                ...layer,
                opacity: normalizedOpacity,
              }
            : layer,
        ),
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

  const selectedLayer: Layer | null = scene
    ? (scene.layers.find((layer) => layer.id === selectedLayerId) ?? null)
    : null;

  const sortedLayers: Layer[] = scene
    ? [...scene.layers].sort((first, second) => second.zIndex - first.zIndex)
    : [];

  if (loadError) {
    return (
      <main className="app">
        <h1 className="app-title">AI-Broll-Assistant</h1>
        <p className="app-stage">Failed to load project: {loadError}</p>
      </main>
    );
  }

  if (!project || !scene) {
    return (
      <main className="app">
        <h1 className="app-title">AI-Broll-Assistant</h1>
        <p className="app-stage">Loading project...</p>
      </main>
    );
  }

  return (
    <main className="app">
      <h1 className="app-title">{project.name}</h1>

      <p className="app-subtitle">
        {project.width} × {project.height} · {project.fps} fps
      </p>

      <nav aria-label="Scenes">
        {project.scenes.map((sceneReference, index) => {
          const isCurrent = sceneReference.id === scene.id;

          return (
            <button
              key={sceneReference.id}
              type="button"
              disabled={isCurrent || isDirty || isSceneLoading || isSaving}
              onClick={() => void handleSceneSelect(sceneReference.id)}
            >
              Scene {index + 1}
              {isCurrent ? " · Current" : ""}
            </button>
          );
        })}
      </nav>

      {isDirty ? (
        <p className="app-stage">
          Save the current scene before switching scenes.
        </p>
      ) : null}

      {sceneError ? (
        <p className="app-stage">Failed to load scene: {sceneError}</p>
      ) : null}

      <p className="app-stage">
        Scene: {scene.topic} · {scene.layers.length} layers
      </p>

      <button
        type="button"
        disabled={!isDirty || isSaving}
        onClick={() => void handleSave()}
      >
        {isSaving ? "Saving..." : isDirty ? "Save scene" : "Saved"}
      </button>

      {saveError ? <p className="app-stage">Save failed: {saveError}</p> : null}

      <section>
        <h2>Fabric editor</h2>

        <p className="app-stage">
          Selected layer:{" "}
          {selectedLayer
            ? `${selectedLayer.name} (${selectedLayer.type})`
            : "None"}
        </p>

        <div aria-label="Layers">
          {sortedLayers.map((layer) => {
            const isSelected = layer.id === selectedLayerId;

            return (
              <button
                key={layer.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedLayerId(isSelected ? null : layer.id)}
              >
                {layer.name} · {layer.type}
                {isSelected ? " · Selected" : ""}
              </button>
            );
          })}
        </div>

        {selectedLayer ? (
          <section aria-label="Layer properties">
            <h3>Layer properties</h3>

            <dl>
              <dt>ID</dt>
              <dd>{selectedLayer.id}</dd>

              <dt>Type</dt>
              <dd>{selectedLayer.type}</dd>

              <dt>X</dt>
              <dd>{selectedLayer.x}</dd>

              <dt>Y</dt>
              <dd>{selectedLayer.y}</dd>

              <dt>Width</dt>
              <dd>{selectedLayer.width}</dd>

              <dt>Height</dt>
              <dd>{selectedLayer.height}</dd>

              <dt>Scale X</dt>
              <dd>{selectedLayer.scaleX}</dd>

              <dt>Scale Y</dt>
              <dd>{selectedLayer.scaleY}</dd>

              <dt>Rotation</dt>
              <dd>{selectedLayer.rotation}</dd>

              <dt>Opacity</dt>
              <dd>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedLayer.opacity}
                  aria-label="Layer opacity slider"
                  onChange={(event) => {
                    handleOpacityChange(event.currentTarget.valueAsNumber);
                  }}
                />

                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedLayer.opacity}
                  aria-label="Layer opacity value"
                  onChange={(event) => {
                    handleOpacityChange(event.currentTarget.valueAsNumber);
                  }}
                />
              </dd>

              <dt>Z-index</dt>
              <dd>{selectedLayer.zIndex}</dd>

              <dt>Visible</dt>
              <dd>{selectedLayer.visible ? "Yes" : "No"}</dd>

              <dt>Locked</dt>
              <dd>{selectedLayer.locked ? "Yes" : "No"}</dd>
            </dl>
          </section>
        ) : (
          <p className="app-stage">Select a layer to view its properties.</p>
        )}

        <FabricSceneCanvas
          scene={scene}
          projectWidth={project.width}
          projectHeight={project.height}
          displayScale={0.5}
          onSceneChange={handleSceneChange}
          onSelectedLayerChange={setSelectedLayerId}
          selectedLayerId={selectedLayerId}
        />
      </section>

      <section>
        <h2>Remotion preview</h2>

        <RemotionScenePlayer
          scene={scene}
          projectWidth={project.width}
          projectHeight={project.height}
          fps={project.fps}
          displayScale={0.5}
        />
      </section>
    </main>
  );
}

export default App;
