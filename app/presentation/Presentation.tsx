import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PresentationData } from "../src/presentation/presentationData";
import type { Scene } from "../src/domain/sceneSchema";
import { SceneComposition } from "../src/remotion/SceneComposition";

const TRANSITION_DURATION_MS = 350;

interface ActivePageTransition {
  fromScene: Scene;
  fromFrame: number;
  direction: "forward" | "backward";
  type: "fade" | "slide";
}

function resolvePageTransition(
  target: Scene,
): ActivePageTransition["type"] | null {
  const type = target.transition?.type ?? "none";
  return type === "none" ? null : type;
}

export function Presentation({ data }: { data: PresentationData }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [playbackKey, setPlaybackKey] = useState(0);
  const [transition, setTransition] = useState<ActivePageTransition | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const transitionTimer = useRef<number | null>(null);
  const { project, scenes } = data;
  const scene = scenes[pageIndex];

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
  }, []);

  useEffect(() => clearTransitionTimer, [clearTransitionTimer]);

  const goToPage = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= scenes.length) return;
      // Ignore navigation input while a transition is playing; it only lasts
      // a few hundred milliseconds.
      if (transition !== null) return;
      if (nextIndex === pageIndex) {
        setPlaybackKey((current) => current + 1);
        return;
      }
      const target = scenes[nextIndex];
      const transitionType = resolvePageTransition(target);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (transitionType === null || reduceMotion) {
        setPageIndex(nextIndex);
        setPlaybackKey((current) => current + 1);
        return;
      }
      const fromFrame = Math.max(
        0,
        Math.min(
          playerRef.current?.getCurrentFrame() ?? 0,
          scene.durationInFrames - 1,
        ),
      );
      clearTransitionTimer();
      setTransition({
        fromScene: scene,
        fromFrame,
        direction: nextIndex > pageIndex ? "forward" : "backward",
        type: transitionType,
      });
      setPageIndex(nextIndex);
      setPlaybackKey((current) => current + 1);
      transitionTimer.current = window.setTimeout(() => {
        setTransition(null);
        transitionTimer.current = null;
      }, TRANSITION_DURATION_MS);
    },
    [scenes, pageIndex, scene, transition, clearTransitionTimer],
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
          {transition ? (
            <div
              className="page-transition-layer"
              aria-hidden="true"
            >
              <Player
                key={`transition-${transition.fromScene.id}`}
                ref={(player) => {
                  if (player) {
                    player.seekTo(transition.fromFrame);
                    player.pause();
                  }
                }}
                component={SceneComposition}
                inputProps={{
                  scene: transition.fromScene,
                  assetBaseUrl: ".",
                  previewBackdrop: true,
                }}
                durationInFrames={transition.fromScene.durationInFrames}
                compositionWidth={project.width}
                compositionHeight={project.height}
                fps={project.fps}
                autoPlay={false}
                controls={false}
                clickToPlay={false}
                spaceKeyToPlayOrPause={false}
                moveToBeginningWhenEnded={false}
                acknowledgeRemotionLicense
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          ) : null}
          <div
            className={
              transition
                ? `page-transition-layer page-transition-incoming-${transition.type}-${transition.direction}`
                : "page-transition-layer"
            }
          >
            <Player
              key={`${scene.id}-${playbackKey}`}
              ref={playerRef}
              component={SceneComposition}
              inputProps={{
                scene,
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
