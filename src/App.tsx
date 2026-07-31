import { useEffect, useState } from "react";
import "./App.css";
import { fetchProject, fetchScene } from "./api/projectApi";
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
  const [error, setError] = useState<string | null>(null);

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
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(loadError));
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="app">
        <h1 className="app-title">AI-Broll-Assistant</h1>
        <p className="app-stage">Failed to load project: {error}</p>
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

      <FabricSceneCanvas
        scene={scene}
        projectWidth={project.width}
        projectHeight={project.height}
        displayScale={0.5}
        onSceneChange={setScene}
      />
    </main>
  );
}

export default App;
