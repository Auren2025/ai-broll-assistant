import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { PlayerRef } from "@remotion/player";
import type { LayerAnimation } from "../domain/layerAnimationSchema";
import type { Scene } from "../domain/sceneSchema";
import type { SubtitleCue } from "../domain/subtitleCueSchema";
import {
  getAnimationPhaseLabel,
  getAnimationPresetLabel,
} from "./animationCatalog";
import { getTimelineEvents, type TimelineEvent } from "./timelineEvents";

type TimingPatch = Pick<LayerAnimation, "startFrame" | "durationInFrames">;

interface SceneAnimationTimelineProps {
  scene: Scene;
  timelineStartFrame: number;
  fps: number;
  selectedLayerId: string | null;
  selectedAnimationId: string | null;
  isPreviewMode: boolean;
  playerRef: RefObject<PlayerRef | null>;
  onSeek: (frame: number) => void;
  onAnimationSelect: (layerId: string, animationId: string) => void;
  onAnimationTimingChange: (
    layerId: string,
    animationId: string,
    patch: TimingPatch,
  ) => void;
  /** All project subtitle cues; the track shows the ones overlapping this scene. Empty for slide projects. */
  subtitleCues: SubtitleCue[];
  /** Split handler for B-roll; null hides the subtitle track's split menu (slide). */
  onSplitScene: ((absoluteFrame: number) => void) | null;
  /** Clear the layer/animation selection, e.g. when clicking empty track space. */
  onDeselect: () => void;
}

interface DragPreview extends TimingPatch {
  layerId: string;
  animationId: string;
}

type DragMode = "move" | "resize-start" | "resize-end";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Right-clicks within this many pixels of the playhead snap to it for splitting. */
export const PLAYHEAD_SPLIT_SNAP_PX = 10;

export interface SplitFrameInput {
  /** Horizontal click position in client pixels. */
  clickClientX: number;
  /** Left edge of the timeline track in client pixels. */
  trackLeft: number;
  /** Width of the timeline track in client pixels. */
  trackWidth: number;
  durationInFrames: number;
  currentFrame: number;
  isPreviewMode: boolean;
}

/**
 * Resolve the scene-relative frame for a split context-menu click.
 * Right-clicking on (or near) the playhead splits at the playhead so the
 * user can position it first and split precisely; otherwise the click
 * position is used. Frame 0 is not a valid split point and falls back to
 * the click position.
 */
export function resolveSplitFrame(input: SplitFrameInput): number {
  const { clickClientX, trackLeft, trackWidth, durationInFrames, currentFrame, isPreviewMode } = input;
  const ratio = clamp((clickClientX - trackLeft) / trackWidth, 0, 1);
  const clickFrame = Math.round(ratio * durationInFrames);
  const playheadX = trackLeft + (currentFrame / durationInFrames) * trackWidth;
  if (
    isPreviewMode &&
    currentFrame > 0 &&
    Math.abs(clickClientX - playheadX) <= PLAYHEAD_SPLIT_SNAP_PX
  ) {
    return currentFrame;
  }
  return clickFrame;
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

export function SceneAnimationTimeline({
  scene,
  timelineStartFrame,
  fps,
  selectedLayerId,
  selectedAnimationId,
  isPreviewMode,
  playerRef,
  onSeek,
  onAnimationSelect,
  onAnimationTimingChange,
  subtitleCues,
  onSplitScene,
  onDeselect,
}: SceneAnimationTimelineProps) {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [splitMenu, setSplitMenu] = useState<{
    x: number;
    y: number;
    frame: number;
  } | null>(null);
  const events = getTimelineEvents(scene.layers);
  const ticks = getTickFrames(scene.durationInFrames, fps);
  const maximumFrame = Math.max(0, scene.durationInFrames - 1);
  const playheadLeft = (currentFrame / scene.durationInFrames) * 100;

  // Subtitle blocks overlapping this scene, positioned in scene-local frames.
  const subtitleBlocks = useMemo(() => {
    if (subtitleCues.length === 0) return [];
    const sceneEndFrame = timelineStartFrame + scene.durationInFrames;
    const blocks: { cue: SubtitleCue; startFrame: number; endFrame: number }[] = [];
    for (const cue of subtitleCues) {
      const cueStartFrame = (cue.startMs / 1000) * fps;
      const cueEndFrame = (cue.endMs / 1000) * fps;
      if (cueEndFrame <= timelineStartFrame || cueStartFrame >= sceneEndFrame) {
        continue;
      }
      blocks.push({
        cue,
        startFrame: clamp(cueStartFrame - timelineStartFrame, 0, scene.durationInFrames),
        endFrame: clamp(cueEndFrame - timelineStartFrame, 0, scene.durationInFrames),
      });
    }
    return blocks;
  }, [subtitleCues, timelineStartFrame, scene.durationInFrames, fps]);

  const showSubtitleTrack = subtitleBlocks.length > 0 && onSplitScene !== null;

  useEffect(() => {
    const player = playerRef.current;
    if (!isPreviewMode || !player) {
      setCurrentFrame(0);
      return;
    }

    const updateFrame = (absoluteFrame: number): void => {
      setCurrentFrame(
        clamp(absoluteFrame - timelineStartFrame, 0, maximumFrame),
      );
    };
    const handleFrameUpdate = (event: { detail: { frame: number } }): void => {
      updateFrame(event.detail.frame);
    };

    updateFrame(player.getCurrentFrame());
    player.addEventListener("frameupdate", handleFrameUpdate);
    return () => player.removeEventListener("frameupdate", handleFrameUpdate);
  }, [isPreviewMode, maximumFrame, playerRef, scene.id, timelineStartFrame]);

  useEffect(() => {
    if (!splitMenu) return;
    const close = (): void => setSplitMenu(null);
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") setSplitMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [splitMenu]);

  function handleSubtitleContextMenu(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!onSplitScene) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const frame = resolveSplitFrame({
      clickClientX: event.clientX,
      trackLeft: bounds.left,
      trackWidth: bounds.width,
      durationInFrames: scene.durationInFrames,
      currentFrame,
      isPreviewMode,
    });
    setSplitMenu({
      x: event.clientX,
      y: event.clientY,
      frame,
    });
  }

  function handleTrackEmptyClick(event: ReactMouseEvent<HTMLDivElement>): void {
    // Clicks on an animation bar bubble up here; those select the animation
    // instead of clearing the selection.
    if ((event.target as HTMLElement).closest(".animation-event-bar")) return;
    onDeselect();
  }

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
    if (event.button !== 0 || timelineEvent.locked || !timelineEvent.editable) {
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
      !timelineEvent.editable ||
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
      {events.length === 0 && !showSubtitleTrack ? (
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

          {showSubtitleTrack ? (
            <div className="animation-timeline-row subtitle-timeline-row">
              <div className="animation-event-label subtitle-timeline-label">
                <strong>Subtitles</strong>
              </div>
              <div
                className="animation-timeline-track subtitle-timeline-track"
                onContextMenu={handleSubtitleContextMenu}
                onClick={handleTrackEmptyClick}
                title="Right-click to split the scene here, or near the playhead to split at the playhead"
              >
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
                {subtitleBlocks.map((block) => {
                  const left = (block.startFrame / scene.durationInFrames) * 100;
                  const width =
                    ((block.endFrame - block.startFrame) / scene.durationInFrames) * 100;
                  return (
                    <span
                      key={block.cue.id}
                      className="subtitle-cue-block"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={block.cue.text}
                    >
                      {block.cue.text}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {events.map((timelineEvent, index) => {
            const { layer, animation } = timelineEvent;            const preview =
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
                  disabled={!timelineEvent.editable}
                  onClick={() => onAnimationSelect(layer.id, animation.id)}
                >
                  <span>{index + 1}</span>
                  <strong>{layer.name}</strong>
                  <small>{getAnimationPhaseLabel(animation.phase)} · {getAnimationPresetLabel(animation.preset)}</small>
                </button>
                <div
                  className="animation-timeline-track"
                  onClick={handleTrackEmptyClick}
                >
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
                    disabled={timelineEvent.locked || !timelineEvent.editable}
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
      {splitMenu && onSplitScene ? (
        <div
          className="subtitle-split-menu"
          style={{ left: splitMenu.x, top: splitMenu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSplitScene(timelineStartFrame + splitMenu.frame);
              setSplitMenu(null);
            }}
          >
            Split scene here · {(splitMenu.frame / fps).toFixed(1)}s
          </button>
        </div>
      ) : null}
    </section>
  );
}
