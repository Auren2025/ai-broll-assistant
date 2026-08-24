import { useEffect, useState } from "react";
import { RemotionScenePlayer } from "../remotion/RemotionScenePlayer";
import {
  PREVIEW_CHANNEL_NAME,
  type PreviewStateMessage,
  type PreviewSyncMessage,
} from "./previewChannel";

interface ViewportSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function PreviewWindow() {
  const [previewState, setPreviewState] =
    useState<PreviewStateMessage | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<PreviewSyncMessage>) => {
      if (event.data.type === "state") {
        setPreviewState(event.data);
      }
    };

    channel.postMessage({ type: "ready" } satisfies PreviewSyncMessage);

    return () => {
      channel.close();
    };
  }, []);

  useEffect(() => {
    const handleResize = (): void => {
      setViewportSize(getViewportSize());
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (!previewState) {
    return (
      <main className="preview-waiting">
        <div className="loading-mark" />
        <h1>AI-Broll Preview</h1>
        <p>Waiting for the editor…</p>
      </main>
    );
  }

  const { project, scene, isDirty } = previewState;
  const displayScale = Math.max(
    0.1,
    Math.min(
      1,
      (viewportSize.width - 48) / project.width,
      (viewportSize.height - 106) / project.height,
    ),
  );

  return (
    <main className="preview-app">
      <header className="preview-toolbar">
        <div>
          <h1>{scene.topic}</h1>
          <p>
            {project.name} · {scene.id}
          </p>
        </div>
        <span className={`preview-live${isDirty ? " is-dirty" : ""}`}>
          {isDirty ? "Live · Unsaved" : "Live preview"}
        </span>
      </header>
      <section className="preview-stage" aria-label="Remotion scene preview">
        <div className="preview-player">
          <RemotionScenePlayer
            key={scene.id}
            scene={scene}
            projectId={project.id}
            projectWidth={project.width}
            projectHeight={project.height}
            fps={project.fps}
            displayScale={displayScale}
          />
        </div>
      </section>
    </main>
  );
}
