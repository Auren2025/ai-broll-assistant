import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { fetchProject, fetchScene, saveScene } from "./api/projectApi";
import type { Project } from "./domain/projectSchema";
import type { Scene } from "./domain/sceneSchema";
import { FabricSceneCanvas } from "./editor/FabricSceneCanvas";

const PROJECT_ID = "video001";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

      <FabricSceneCanvas
        scene={scene}
        projectWidth={project.width}
        projectHeight={project.height}
        displayScale={0.5}
        onSceneChange={handleSceneChange}
      />
    </main>
  );
}

export default App;
