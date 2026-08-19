import { Player } from "@remotion/player";
import { useCallback, useEffect, useState } from "react";
import type { PresentationData } from "../src/presentation/presentationData";
import { SceneComposition } from "../src/remotion/SceneComposition";

export function Presentation({ data }: { data: PresentationData }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [playbackKey, setPlaybackKey] = useState(0);
  const { project, scenes } = data;
  const scene = scenes[pageIndex];

  const goToPage = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= scenes.length) return;
      setPageIndex(nextIndex);
      setPlaybackKey((current) => current + 1);
    },
    [scenes.length],
  );

  const replay = useCallback(() => {
    setPlaybackKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, input, select, textarea, a")
      ) {
        return;
      }

      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goToPage(pageIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPage(pageIndex - 1);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        replay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPage, pageIndex, replay]);

  return (
    <main className="presentation-app">
      <header className="presentation-header">
        <strong>{project.name}</strong>
        <span>
          {pageIndex + 1} / {scenes.length}
        </span>
      </header>

      <section
        className="presentation-stage"
        aria-label={`第 ${pageIndex + 1} 页：${scene.topic}`}
        onClick={() => goToPage(pageIndex + 1)}
      >
        <div
          className="presentation-player"
          style={{
            aspectRatio: `${project.width} / ${project.height}`,
            width:
              `min(100%, calc((100vh - 150px) * ` +
              `${project.width} / ${project.height}))`,
          }}
        >
          <Player
            key={`${scene.id}-${playbackKey}`}
            component={SceneComposition}
            inputProps={{
              scene,
              projectId: project.id,
              assetBaseUrl: ".",
              previewBackdrop: true,
            }}
            durationInFrames={scene.durationInFrames}
            compositionWidth={project.width}
            compositionHeight={project.height}
            fps={project.fps}
            autoPlay
            controls={false}
            clickToPlay={false}
            spaceKeyToPlayOrPause={false}
            moveToBeginningWhenEnded={false}
            acknowledgeRemotionLicense
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </section>

      <footer
        className="presentation-controls"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => goToPage(pageIndex - 1)}
          disabled={pageIndex === 0}
        >
          上一页
        </button>
        <button type="button" onClick={replay}>
          重播
        </button>
        <button
          type="button"
          onClick={() => goToPage(pageIndex + 1)}
          disabled={pageIndex === scenes.length - 1}
        >
          下一页
        </button>
      </footer>
    </main>
  );
}
