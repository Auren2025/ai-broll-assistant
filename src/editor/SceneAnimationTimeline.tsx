import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { LayerAnimation } from "../domain/layerAnimationSchema";
import type { Scene } from "../domain/sceneSchema";
import { getTimelineEvents, type TimelineEvent } from "./timelineEvents";

type TimingPatch = Pick<LayerAnimation, "startFrame" | "durationInFrames">;

interface SceneAnimationTimelineProps {
  scene: Scene;
  fps: number;
  selectedLayerId: string | null;
  selectedAnimationId: string | null;
  isPreviewMode: boolean;
  currentFrame: number;
  onSeek: (frame: number) => void;
  onAnimationSelect: (layerId: string, animationId: string) => void;
  onAnimationTimingChange: (
    layerId: string,
    animationId: string,
    patch: TimingPatch,
  ) => void;
}

interface DragPreview extends TimingPatch {
  layerId: string;
  animationId: string;
}

type DragMode = "move" | "resize-start" | "resize-end";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getTickFrames(durationInFrames: number, fps: number): number[] {
  const durationInSeconds = durationInFrames / fps;
  const stepInSeconds =
    durationInSeconds <= 3 ? 0.5 : durationInSeconds <= 8 ? 1 : 2;
  const ticks: number[] = [];

  for (
    let seconds = 0;
    seconds < durationInSeconds;
    seconds += stepInSeconds
  ) {
    ticks.push(Math.round(seconds * fps));
  }

  return [...new Set([...ticks, durationInFrames])];
}

function phaseLabel(phase: LayerAnimation["phase"]): string {
  switch (phase) {
    case "enter":
      return "Build In";
    case "emphasis":
      return "Action";
    case "exit":
      return "Build Out";
  }
}

export function SceneAnimationTimeline({
  scene,
  fps,
  selectedLayerId,
  selectedAnimationId,
  isPreviewMode,
  currentFrame,
  onSeek,
  onAnimationSelect,
  onAnimationTimingChange,
}: SceneAnimationTimelineProps) {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const events = getTimelineEvents(scene.layers);
  const ticks = getTickFrames(scene.durationInFrames, fps);
  const maximumFrame = Math.max(0, scene.durationInFrames - 1);
  const playheadLeft = (currentFrame / scene.durationInFrames) * 100;

  function seekFromClientX(clientX: number, ruler: HTMLElement): void {
    const bounds = ruler.getBoundingClientRect();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    onSeek(Math.round(ratio * maximumFrame));
  }

  function beginScrub(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!isPreviewMode || event.button !== 0) {
      return;
    }

    event.preventDefault();
    const ruler = event.currentTarget;
    const updateFrame = (pointerEvent: PointerEvent): void => {
      seekFromClientX(pointerEvent.clientX, ruler);
    };
    const finishScrub = (): void => {
      window.removeEventListener("pointermove", updateFrame);
      window.removeEventListener("pointerup", finishScrub);
      window.removeEventListener("pointercancel", finishScrub);
    };

    seekFromClientX(event.clientX, ruler);
    window.addEventListener("pointermove", updateFrame);
    window.addEventListener("pointerup", finishScrub);
    window.addEventListener("pointercancel", finishScrub);
  }

  function handleRulerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const step = event.shiftKey ? 5 : 1;
    onSeek(clamp(currentFrame + direction * step, 0, maximumFrame));
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    timelineEvent: TimelineEvent,
    mode: DragMode,
  ): void {
    if (event.button !== 0 || timelineEvent.locked) {
      return;
    }

    const track = event.currentTarget.closest<HTMLElement>(
      ".animation-timeline-track",
    );
    if (!track) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onAnimationSelect(timelineEvent.layer.id, timelineEvent.animation.id);

    const { animation } = timelineEvent;
    const initialClientX = event.clientX;
    const trackWidth = track.getBoundingClientRect().width;
    const initialEnd = animation.startFrame + animation.durationInFrames;
    let currentTiming: TimingPatch = {
      startFrame: animation.startFrame,
      durationInFrames: animation.durationInFrames,
    };

    const updatePreview = (pointerEvent: PointerEvent): void => {
      const frameDelta = Math.round(
        ((pointerEvent.clientX - initialClientX) / trackWidth) *
          scene.durationInFrames,
      );

      if (mode === "move") {
        currentTiming = {
          startFrame: clamp(
            animation.startFrame + frameDelta,
            0,
            scene.durationInFrames - animation.durationInFrames,
          ),
          durationInFrames: animation.durationInFrames,
        };
      } else if (mode === "resize-start") {
        const startFrame = clamp(
          animation.startFrame + frameDelta,
          0,
          initialEnd - 1,
        );
        currentTiming = {
          startFrame,
          durationInFrames: initialEnd - startFrame,
        };
      } else {
        const endFrame = clamp(
          initialEnd + frameDelta,
          animation.startFrame + 1,
          scene.durationInFrames,
        );
        currentTiming = {
          startFrame: animation.startFrame,
          durationInFrames: endFrame - animation.startFrame,
        };
      }

      setDragPreview({
        layerId: timelineEvent.layer.id,
        animationId: animation.id,
        ...currentTiming,
      });
    };

    const finishDrag = (): void => {
      window.removeEventListener("pointermove", updatePreview);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      setDragPreview(null);

      if (
        currentTiming.startFrame !== animation.startFrame ||
        currentTiming.durationInFrames !== animation.durationInFrames
      ) {
        onAnimationTimingChange(
          timelineEvent.layer.id,
          animation.id,
          currentTiming,
        );
      }
    };

    setDragPreview({
      layerId: timelineEvent.layer.id,
      animationId: animation.id,
      ...currentTiming,
    });
    window.addEventListener("pointermove", updatePreview);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  }

  function handleBarKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    timelineEvent: TimelineEvent,
  ): void {
    if (
      timelineEvent.locked ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const step = event.shiftKey ? 5 : 1;
    const { animation } = timelineEvent;
    const startFrame = clamp(
      animation.startFrame + direction * step,
      0,
      scene.durationInFrames - animation.durationInFrames,
    );

    if (startFrame !== animation.startFrame) {
      onAnimationTimingChange(timelineEvent.layer.id, animation.id, {
        startFrame,
        durationInFrames: animation.durationInFrames,
      });
    }
  }

  return (
    <section className="scene-animation-timeline" aria-label="Scene animation timing">
      {events.length === 0 ? (
        <p className="animation-timeline-empty">
          Select a layer below and add an animation to build the scene timing.
        </p>
      ) : (
        <div className="animation-timeline-grid">
          <div className="animation-timeline-label-heading">Build order</div>
          <div
            className={`animation-timeline-ruler${isPreviewMode ? " is-scrubbable" : ""}`}
            role={isPreviewMode ? "slider" : undefined}
            tabIndex={isPreviewMode ? 0 : undefined}
            aria-hidden={isPreviewMode ? undefined : true}
            aria-label={isPreviewMode ? "Preview frame" : undefined}
            aria-valuemin={isPreviewMode ? 0 : undefined}
            aria-valuemax={isPreviewMode ? maximumFrame : undefined}
            aria-valuenow={isPreviewMode ? currentFrame : undefined}
            aria-valuetext={isPreviewMode ? `${currentFrame} frames` : undefined}
            onKeyDown={isPreviewMode ? handleRulerKeyDown : undefined}
            onPointerDown={isPreviewMode ? beginScrub : undefined}
          >
            {ticks.map((frame) => (
              <span
                key={frame}
                style={{ left: `${(frame / scene.durationInFrames) * 100}%` }}
              >
                {Number((frame / fps).toFixed(2))}s
              </span>
            ))}
            {isPreviewMode ? (
              <i
                className="animation-timeline-playhead"
                style={{ left: `${playheadLeft}%` }}
                aria-hidden="true"
              >
                <b>{currentFrame}</b>
              </i>
            ) : null}
          </div>

          {events.map((timelineEvent, index) => {
            const { layer, animation } = timelineEvent;
            const preview =
              dragPreview?.layerId === layer.id &&
              dragPreview.animationId === animation.id
                ? dragPreview
                : animation;
            const left = (preview.startFrame / scene.durationInFrames) * 100;
            const width =
              (preview.durationInFrames / scene.durationInFrames) * 100;
            const isSelected =
              selectedLayerId === layer.id &&
              selectedAnimationId === animation.id;

            return (
              <div className="animation-timeline-row" key={`${layer.id}:${animation.id}`}>
                <button
                  type="button"
                  className={`animation-event-label${isSelected ? " is-selected" : ""}`}
                  style={{ paddingLeft: `${12 + timelineEvent.depth * 12}px` }}
                  onClick={() => onAnimationSelect(layer.id, animation.id)}
                >
                  <span>{index + 1}</span>
                  <strong>{layer.name}</strong>
                  <small>{phaseLabel(animation.phase)} · {animation.preset}</small>
                </button>
                <div className="animation-timeline-track">
                  {ticks
                    .filter((frame) => frame !== 0)
                    .map((frame) => (
                      <i
                        aria-hidden="true"
                        key={frame}
                        style={{ left: `${(frame / scene.durationInFrames) * 100}%` }}
                      />
                    ))}
                  {isPreviewMode ? (
                    <span
                      className="animation-timeline-playhead"
                      style={{ left: `${playheadLeft}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <button
                    type="button"
                    className={`animation-event-bar phase-${animation.phase}${isSelected ? " is-selected" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    disabled={timelineEvent.locked}
                    aria-label={`${layer.name} ${animation.phase}, frame ${preview.startFrame} to ${preview.startFrame + preview.durationInFrames}`}
                    title={`${preview.startFrame}–${preview.startFrame + preview.durationInFrames} frames`}
                    onClick={() => onAnimationSelect(layer.id, animation.id)}
                    onKeyDown={(keyboardEvent) =>
                      handleBarKeyDown(keyboardEvent, timelineEvent)
                    }
                    onPointerDown={(pointerEvent) =>
                      beginDrag(pointerEvent, timelineEvent, "move")
                    }
                  >
                    <span
                      className="animation-resize-handle is-start"
                      onPointerDown={(pointerEvent) =>
                        beginDrag(pointerEvent, timelineEvent, "resize-start")
                      }
                    />
                    <span className="animation-event-time">
                      {preview.startFrame}–{preview.startFrame + preview.durationInFrames}
                    </span>
                    <span
                      className="animation-resize-handle is-end"
                      onPointerDown={(pointerEvent) =>
                        beginDrag(pointerEvent, timelineEvent, "resize-end")
                      }
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
