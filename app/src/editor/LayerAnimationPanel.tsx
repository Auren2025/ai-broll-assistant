import { useEffect, useState } from "react";
import type { Layer } from "../domain/sceneSchema";
import type {
  AnimationEasing,
  AnimationPhase,
  FadeAndMoveDirection,
  LayerAnimation,
} from "../domain/layerAnimationSchema";
import { BufferedNumberInput } from "./BufferedNumberInput";

const PHASES = [
  { phase: "enter", label: "Build In" },
  { phase: "emphasis", label: "Action" },
  { phase: "exit", label: "Build Out" },
] as const satisfies readonly { phase: AnimationPhase; label: string }[];

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

interface LayerAnimationPanelProps {
  layer: Layer | null;
  fps: number;
  sceneDurationInFrames: number;
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
  direction?: FadeAndMoveDirection;
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

function animationLabel(animation: LayerAnimation): string {
  switch (animation.preset) {
    case "fade-and-move":
      return "Fade and Move";
    case "magic-move":
      return "Magic Move";
    case "dissolve":
      return "Dissolve";
  }
}

function phaseEffectLabel(phase: AnimationPhase): string {
  switch (phase) {
    case "enter":
      return "Fade and Move";
    case "emphasis":
      return "Magic Move";
    case "exit":
      return "Dissolve";
  }
}

function phasePresetClass(phase: AnimationPhase): string {
  switch (phase) {
    case "enter":
      return "fade-and-move";
    case "emphasis":
      return "magic-move";
    case "exit":
      return "dissolve";
  }
}

function makeUniqueAnimationId(layer: Layer, phase: AnimationPhase): string {
  const existingIds = new Set(layer.animations.map((animation) => animation.id));
  const baseId = `${layer.id}-${phase}`;
  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function defaultAnimation(
  layer: Layer,
  phase: AnimationPhase,
  sceneDurationInFrames: number,
  fps: number,
): LayerAnimation {
  const durationInFrames = Math.min(fps, sceneDurationInFrames);
  const id = makeUniqueAnimationId(layer, phase);

  if (phase === "enter") {
    return {
      id,
      phase,
      preset: "fade-and-move",
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
      direction: "bottom-to-top",
      travelDistance: 40,
    };
  }

  if (phase === "exit") {
    return {
      id,
      phase,
      preset: "dissolve",
      startFrame: sceneDurationInFrames - durationInFrames,
      durationInFrames,
      easing: "ease-in-out",
    };
  }

  return {
    id,
    phase,
    preset: "magic-move",
    startFrame: Math.floor((sceneDurationInFrames - durationInFrames) / 2),
    durationInFrames,
    easing: "ease-in-out",
    translateX: 0,
    translateY: 0,
    scale: 1,
    opacity: 1,
  };
}

export function LayerAnimationPanel({
  layer,
  fps,
  sceneDurationInFrames,
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

  function applyPhaseEffect(): void {
    if (!layer) return;
    const existing = layer.animations.find(
      (animation) => animation.phase === displayedPhase,
    );

    if (existing) {
      onAnimationSelect(existing.id);
      return;
    }

    const animation = defaultAnimation(
      layer,
      displayedPhase,
      sceneDurationInFrames,
      fps,
    );
    onAnimationsChange([...layer.animations, animation]);
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

  return (
    <section className="animation-inspector" aria-label="Layer animations">
      <div className="animation-phase-tabs" role="tablist" aria-label="Animation phase">
        {PHASES.map(({ phase, label }) => (
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
              <h3>{animationLabel(selectedAnimation)}</h3>
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
            <h4>{PHASES.find(({ phase }) => phase === displayedPhase)?.label}</h4>
            <div className="animation-preset-grid is-single">
              <button
                type="button"
                className={
                  layer.animations.some(
                    (animation) => animation.phase === displayedPhase,
                  )
                    ? "is-current"
                    : ""
                }
                onClick={applyPhaseEffect}
              >
                <span
                  className={`animation-preset-preview preset-${phasePresetClass(displayedPhase)}`}
                />
                <strong>{phaseEffectLabel(displayedPhase)}</strong>
                {layer.animations.some(
                  (animation) => animation.phase === displayedPhase,
                ) ? (
                  <small>Current</small>
                ) : null}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
