import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchProject, fetchScene, saveScene } from "./api/projectApi";
import type { Project } from "./domain/projectSchema";
import type { Scene } from "./domain/sceneSchema";
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

  async function handleSceneSelect(sceneId: string): Promise<void> {
    if (!project || sceneId === scene?.id || isDirty || isSceneLoading) {
      return;
    }

    setIsSceneLoading(true);
    setSceneError(null);

    try {
      const loadedScene = await fetchScene(project.id, sceneId);

      setScene(loadedScene);
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

        <FabricSceneCanvas
          scene={scene}
          projectWidth={project.width}
          projectHeight={project.height}
          displayScale={0.5}
          onSceneChange={handleSceneChange}
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
