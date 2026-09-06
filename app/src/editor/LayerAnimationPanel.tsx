import { useEffect, useState } from "react";
import type { Layer } from "../domain/sceneSchema";
import type {
  AnimationEasing,
  AnimationPhase,
  AnimationPreset,
  FadeAndMoveDirection,
  LayerAnimation,
  LineDrawDirection,
  ScaleDirection,
  WipeDirection,
} from "../domain/layerAnimationSchema";
import {
  ANIMATION_PHASE_OPTIONS,
  createDefaultAnimation,
  getAnimationPresetLabel,
  getAnimationPresets,
} from "./animationCatalog";
import { BufferedNumberInput } from "./BufferedNumberInput";

const EASINGS = [
  { value: "linear", label: "None" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease Both" },
] as const satisfies readonly { value: AnimationEasing; label: string }[];

const DIRECTIONS = [
  { value: "right-to-left", label: "Right to Left" },
  { value: "left-to-right", label: "Left to Right" },
  { value: "bottom-to-top", label: "Bottom to Top" },
  { value: "top-to-bottom", label: "Top to Bottom" },
] as const satisfies readonly {
  value: FadeAndMoveDirection;
  label: string;
}[];

const CLOSED_LINE_DRAW_DIRECTIONS = [
  { value: "clockwise", label: "Clockwise" },
  { value: "counterclockwise", label: "Counterclockwise" },
] as const satisfies readonly { value: LineDrawDirection; label: string }[];

const ARROW_LINE_DRAW_DIRECTIONS = [
  { value: "start-to-end", label: "Start to End" },
  { value: "end-to-start", label: "End to Start" },
] as const satisfies readonly { value: LineDrawDirection; label: string }[];

const WIPE_DIRECTIONS = [
  { value: "left-to-right", label: "From Left" },
  { value: "right-to-left", label: "From Right" },
  { value: "top-to-bottom", label: "From Top" },
  { value: "bottom-to-top", label: "From Bottom" },
  { value: "top-left-to-bottom-right", label: "From Top Left" },
  { value: "top-right-to-bottom-left", label: "From Top Right" },
  { value: "bottom-left-to-top-right", label: "From Bottom Left" },
  { value: "bottom-right-to-top-left", label: "From Bottom Right" },
] as const satisfies readonly { value: WipeDirection; label: string }[];

const SCALE_DIRECTIONS = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
] as const satisfies readonly { value: ScaleDirection; label: string }[];

interface LayerAnimationPanelProps {
  layer: Layer | null;
  fps: number;
  sceneDurationInFrames: number;
  readOnlyReason?: string | null;
  selectedAnimationId: string | null;
  onAnimationSelect: (animationId: string | null) => void;
  onAnimationsChange: (animations: LayerAnimation[]) => void;
}

interface BufferedRangeProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onCommit: (value: number) => void;
}

interface AnimationPatch {
  startFrame?: number;
  durationInFrames?: number;
  easing?: AnimationEasing;
  direction?:
    | FadeAndMoveDirection
    | LineDrawDirection
    | WipeDirection
    | ScaleDirection;
  bounce?: boolean;
  travelDistance?: number;
  translateX?: number;
  translateY?: number;
  scale?: number;
  opacity?: number;
}

function BufferedRange({
  label,
  min,
  max,
  step = 1,
  value,
  onCommit,
}: BufferedRangeProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit(): void {
    if (draft !== value) onCommit(draft);
  }

  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(Number(event.currentTarget.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

export function LayerAnimationPanel({
  layer,
  fps,
  sceneDurationInFrames,
  readOnlyReason,
  selectedAnimationId,
  onAnimationSelect,
  onAnimationsChange,
}: LayerAnimationPanelProps) {
  const [activePhase, setActivePhase] = useState<AnimationPhase>("enter");
  const selectedAnimation =
    layer?.animations.find((animation) => animation.id === selectedAnimationId) ??
    null;
  const displayedPhase = selectedAnimation?.phase ?? activePhase;

  useEffect(() => {
    setActivePhase("enter");
  }, [layer?.id]);

  function selectPhase(phase: AnimationPhase): void {
    setActivePhase(phase);
    onAnimationSelect(null);
  }

  function applyPreset(preset: AnimationPreset): void {
    if (!layer) return;
    const existing = layer.animations.find(
      (animation) => animation.phase === displayedPhase,
    );

    if (existing?.preset === preset) {
      onAnimationSelect(existing.id);
      return;
    }

    let animation = createDefaultAnimation(
      layer,
      preset,
      sceneDurationInFrames,
      fps,
    );
    if (existing) {
      animation = {
        ...animation,
        id: existing.id,
        startFrame: existing.startFrame,
        durationInFrames: existing.durationInFrames,
        easing: existing.easing,
      } as LayerAnimation;
    }
    onAnimationsChange(
      existing
        ? layer.animations.map((candidate) =>
            candidate.id === existing.id ? animation : candidate,
          )
        : [...layer.animations, animation],
    );
    onAnimationSelect(animation.id);
  }

  function patchSelectedAnimation(patch: AnimationPatch): void {
    if (!layer || !selectedAnimation) return;
    onAnimationsChange(
      layer.animations.map((animation) =>
        animation.id === selectedAnimation.id
          ? ({ ...animation, ...patch } as LayerAnimation)
          : animation,
      ),
    );
  }

  function removeSelectedAnimation(): void {
    if (!layer || !selectedAnimation) return;
    onAnimationsChange(
      layer.animations.filter(
        (animation) => animation.id !== selectedAnimation.id,
      ),
    );
    onAnimationSelect(null);
  }

  if (!layer) {
    return (
      <section className="animation-inspector-empty">
        <span className="animation-empty-icon">◆</span>
        <h3>Select a layer</h3>
        <p>Choose an element on the canvas, then add a build or action.</p>
      </section>
    );
  }

  if (readOnlyReason) {
    return (
      <section className="animation-inspector-empty">
        <span className="animation-empty-icon">◇</span>
        <h3>Animate the group</h3>
        <p>{readOnlyReason}</p>
      </section>
    );
  }

  return (
    <section className="animation-inspector" aria-label="Layer animations">
      <div className="animation-phase-tabs" role="tablist" aria-label="Animation phase">
        {ANIMATION_PHASE_OPTIONS.map(({ phase, label }) => (
          <button
            type="button"
            role="tab"
            key={phase}
            aria-selected={displayedPhase === phase}
            className={displayedPhase === phase ? "is-active" : ""}
            onClick={() => selectPhase(phase)}
          >
            {label}
          </button>
        ))}
      </div>

      {selectedAnimation ? (
        <div className="animation-event-editor">
          <header className="animation-event-editor-header">
            <span className={`animation-preset-preview preset-${selectedAnimation.preset}`} />
            <div>
              <p>{layer.name}</p>
              <h3>{getAnimationPresetLabel(selectedAnimation.preset)}</h3>
            </div>
          </header>

          <button
            type="button"
            className="animation-change-button"
            onClick={() => onAnimationSelect(null)}
          >
            Change
          </button>

          <div className="animation-control-section">
            <div className="animation-control-heading">
              <label>Duration</label>
              <div className="animation-time-input">
                <BufferedNumberInput
                  aria-label="Animation duration in seconds"
                  min={1 / fps}
                  max={
                    (sceneDurationInFrames - selectedAnimation.startFrame) / fps
                  }
                  step={1 / fps}
                  value={Number(
                    (selectedAnimation.durationInFrames / fps).toFixed(3),
                  )}
                  onValueChange={(seconds) => {
                    const durationInFrames = Math.min(
                      sceneDurationInFrames - selectedAnimation.startFrame,
                      Math.max(1, Math.round(seconds * fps)),
                    );
                    patchSelectedAnimation({ durationInFrames });
                  }}
                />
                <span>s</span>
              </div>
            </div>
            <BufferedRange
              label="Animation duration"
              min={1}
              max={sceneDurationInFrames - selectedAnimation.startFrame}
              value={selectedAnimation.durationInFrames}
              onCommit={(durationInFrames) =>
                patchSelectedAnimation({ durationInFrames })
              }
            />
          </div>

          <div className="animation-control-section">
            <div className="animation-control-heading">
              <label>Start</label>
              <div className="animation-time-input">
                <BufferedNumberInput
                  aria-label="Animation start in seconds"
                  min={0}
                  max={
                    (sceneDurationInFrames -
                      selectedAnimation.durationInFrames) /
                    fps
                  }
                  step={1 / fps}
                  value={Number((selectedAnimation.startFrame / fps).toFixed(3))}
                  onValueChange={(seconds) => {
                    const startFrame = Math.min(
                      sceneDurationInFrames -
                        selectedAnimation.durationInFrames,
                      Math.max(0, Math.round(seconds * fps)),
                    );
                    patchSelectedAnimation({ startFrame });
                  }}
                />
                <span>s</span>
              </div>
            </div>
            <BufferedRange
              label="Animation start"
              min={0}
              max={
                sceneDurationInFrames - selectedAnimation.durationInFrames
              }
              value={selectedAnimation.startFrame}
              onCommit={(startFrame) => patchSelectedAnimation({ startFrame })}
            />
          </div>

          {selectedAnimation.preset === "fade-and-move" ? (
            <>
              <label className="animation-select-row">
                <span>Direction</span>
                <select
                  aria-label="Fade and Move direction"
                  value={selectedAnimation.direction}
                  onChange={(event) =>
                    patchSelectedAnimation({
                      direction: event.currentTarget
                        .value as FadeAndMoveDirection,
                    })
                  }
                >
                  {DIRECTIONS.map((direction) => (
                    <option key={direction.value} value={direction.value}>
                      {direction.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="animation-control-section">
                <div className="animation-control-heading">
                  <label>Travel Distance</label>
                  <div className="animation-time-input">
                    <BufferedNumberInput
                      aria-label="Travel distance percentage"
                      min={0}
                      max={400}
                      step={1}
                      value={selectedAnimation.travelDistance}
                      onValueChange={(travelDistance) =>
                        patchSelectedAnimation({ travelDistance })
                      }
                    />
                    <span>%</span>
                  </div>
                </div>
                <BufferedRange
                  label="Travel distance"
                  min={0}
                  max={400}
                  value={selectedAnimation.travelDistance}
                  onCommit={(travelDistance) =>
                    patchSelectedAnimation({ travelDistance })
                  }
                />
              </div>
            </>
          ) : null}

          {selectedAnimation.preset === "line-draw" ? (
            <label className="animation-select-row">
              <span>Direction</span>
              <select
                aria-label="Line Draw direction"
                value={selectedAnimation.direction}
                onChange={(event) =>
                  patchSelectedAnimation({
                    direction: event.currentTarget.value as LineDrawDirection,
                  })
                }
              >
                {(layer.type === "arrow"
                  ? ARROW_LINE_DRAW_DIRECTIONS
                  : CLOSED_LINE_DRAW_DIRECTIONS
                ).map((direction) => (
                  <option key={direction.value} value={direction.value}>
                    {direction.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedAnimation.preset === "wipe" ? (
            <label className="animation-select-row">
              <span>Direction</span>
              <select
                aria-label="Wipe direction"
                value={selectedAnimation.direction}
                onChange={(event) =>
                  patchSelectedAnimation({
                    direction: event.currentTarget.value as WipeDirection,
                  })
                }
              >
                {WIPE_DIRECTIONS.map((direction) => (
                  <option key={direction.value} value={direction.value}>
                    {direction.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedAnimation.preset === "scale-in" ? (
            <>
              <label className="animation-select-row">
                <span>Direction</span>
                <select
                  aria-label="Scale direction"
                  value={selectedAnimation.direction}
                  onChange={(event) =>
                    patchSelectedAnimation({
                      direction: event.currentTarget.value as ScaleDirection,
                    })
                  }
                >
                  {SCALE_DIRECTIONS.map((direction) => (
                    <option key={direction.value} value={direction.value}>
                      {direction.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="animation-checkbox-row">
                <input
                  type="checkbox"
                  aria-label="Scale bounce"
                  checked={selectedAnimation.bounce}
                  onChange={(event) =>
                    patchSelectedAnimation({ bounce: event.currentTarget.checked })
                  }
                />
                <span>Bounce</span>
              </label>
            </>
          ) : null}

          {selectedAnimation.preset === "magic-move" ? (
            <>
              <div className="animation-control-section">
                <div className="animation-control-heading">
                  <label>Move</label>
                </div>
                <div className="animation-vector-inputs">
                  <label>
                    <span>X</span>
                    <BufferedNumberInput
                      aria-label="Magic Move horizontal distance"
                      min={-10000}
                      max={10000}
                      step={1}
                      value={selectedAnimation.translateX}
                      onValueChange={(translateX) =>
                        patchSelectedAnimation({ translateX })
                      }
                    />
                    <i>px</i>
                  </label>
                  <label>
                    <span>Y</span>
                    <BufferedNumberInput
                      aria-label="Magic Move vertical distance"
                      min={-10000}
                      max={10000}
                      step={1}
                      value={selectedAnimation.translateY}
                      onValueChange={(translateY) =>
                        patchSelectedAnimation({ translateY })
                      }
                    />
                    <i>px</i>
                  </label>
                </div>
              </div>

              <div className="animation-control-section">
                <div className="animation-control-heading">
                  <label>Scale</label>
                  <div className="animation-time-input">
                    <BufferedNumberInput
                      aria-label="Magic Move scale percentage"
                      min={1}
                      max={1000}
                      step={1}
                      value={Number((selectedAnimation.scale * 100).toFixed(2))}
                      onValueChange={(scale) =>
                        patchSelectedAnimation({ scale: scale / 100 })
                      }
                    />
                    <span>%</span>
                  </div>
                </div>
                <BufferedRange
                  label="Magic Move scale"
                  min={1}
                  max={1000}
                  value={selectedAnimation.scale * 100}
                  onCommit={(scale) =>
                    patchSelectedAnimation({ scale: scale / 100 })
                  }
                />
              </div>

              <div className="animation-control-section">
                <div className="animation-control-heading">
                  <label>Opacity</label>
                  <div className="animation-time-input">
                    <BufferedNumberInput
                      aria-label="Magic Move opacity percentage"
                      min={0}
                      max={100}
                      step={1}
                      value={Number((selectedAnimation.opacity * 100).toFixed(2))}
                      onValueChange={(opacity) =>
                        patchSelectedAnimation({ opacity: opacity / 100 })
                      }
                    />
                    <span>%</span>
                  </div>
                </div>
                <BufferedRange
                  label="Magic Move opacity"
                  min={0}
                  max={100}
                  value={selectedAnimation.opacity * 100}
                  onCommit={(opacity) =>
                    patchSelectedAnimation({ opacity: opacity / 100 })
                  }
                />
              </div>
            </>
          ) : null}

          <label className="animation-select-row">
            <span>Acceleration</span>
            <select
              aria-label="Animation easing"
              value={selectedAnimation.easing}
              onChange={(event) =>
                patchSelectedAnimation({
                  easing: event.currentTarget.value as AnimationEasing,
                })
              }
            >
              {EASINGS.map((easing) => (
                <option key={easing.value} value={easing.value}>
                  {easing.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="animation-remove-button"
            onClick={removeSelectedAnimation}
          >
            Remove animation
          </button>
        </div>
      ) : (
        <div className="animation-preset-browser">
          <header>
            <p>{layer.name}</p>
            <h3>Choose an animation</h3>
          </header>
          <section className="animation-preset-group">
            <h4>{ANIMATION_PHASE_OPTIONS.find(({ phase }) => phase === displayedPhase)?.label}</h4>
            <div
              className={`animation-preset-grid${getAnimationPresets(layer, displayedPhase).length === 1 ? " is-single" : ""}`}
            >
              {getAnimationPresets(layer, displayedPhase).map(({ preset, label }) => {
                const isCurrent = layer.animations.some(
                  (animation) => animation.preset === preset,
                );
                return (
                  <button
                    key={preset}
                    type="button"
                    className={isCurrent ? "is-current" : ""}
                    onClick={() => applyPreset(preset)}
                  >
                    <span
                      className={`animation-preset-preview preset-${preset}`}
                    />
                    <strong>{label}</strong>
                    {isCurrent ? <small>Current</small> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
