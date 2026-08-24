import { useEffect, useState } from "react";
import type { Layer } from "../domain/sceneSchema";
import type {
  AnimationEasing,
  AnimationPhase,
  AnimationPreset,
  LayerAnimation,
} from "../domain/layerAnimationSchema";
import { BufferedNumberInput } from "./BufferedNumberInput";

const PHASES = [
  { phase: "enter", label: "Build In" },
  { phase: "emphasis", label: "Action" },
  { phase: "exit", label: "Build Out" },
] as const satisfies readonly { phase: AnimationPhase; label: string }[];

const PRESET_GROUPS = [
  { title: "Fade", presets: ["fade"] },
  {
    title: "Move",
    presets: ["slide-up", "slide-down", "slide-left", "slide-right"],
  },
  { title: "Scale", presets: ["scale"] },
] as const satisfies readonly {
  title: string;
  presets: readonly AnimationPreset[];
}[];

const EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const satisfies readonly AnimationEasing[];

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
  value: number;
  onCommit: (value: number) => void;
}

function BufferedRange({ label, min, max, value, onCommit }: BufferedRangeProps) {
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
      step={1}
      value={draft}
      onChange={(event) => setDraft(Number(event.currentTarget.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

function presetLabel(preset: string): string {
  return preset
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  phase: AnimationPhase,
  preset: AnimationPreset,
  sceneDurationInFrames: number,
): Omit<LayerAnimation, "id"> {
  if (phase === "enter") {
    return {
      phase,
      preset,
      startFrame: 0,
      durationInFrames: Math.min(20, sceneDurationInFrames),
      easing: "ease-out",
    };
  }

  if (phase === "exit") {
    const durationInFrames = Math.min(20, sceneDurationInFrames);
    return {
      phase,
      preset,
      startFrame: sceneDurationInFrames - durationInFrames,
      durationInFrames,
      easing: "ease-in",
    };
  }

  const durationInFrames = Math.min(24, sceneDurationInFrames);
  return {
    phase,
    preset,
    startFrame: Math.floor((sceneDurationInFrames - durationInFrames) / 2),
    durationInFrames,
    easing: "ease-in-out",
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

  function applyPreset(preset: AnimationPreset): void {
    if (!layer) return;
    const existing = layer.animations.find(
      (animation) => animation.phase === displayedPhase,
    );

    if (existing) {
      onAnimationsChange(
        layer.animations.map((animation) =>
          animation.id === existing.id ? { ...animation, preset } : animation,
        ),
      );
      onAnimationSelect(existing.id);
      return;
    }

    const animation: LayerAnimation = {
      id: makeUniqueAnimationId(layer, displayedPhase),
      ...defaultAnimation(displayedPhase, preset, sceneDurationInFrames),
    };
    onAnimationsChange([...layer.animations, animation]);
    onAnimationSelect(animation.id);
  }

  function patchSelectedAnimation(
    patch: Partial<
      Pick<
        LayerAnimation,
        "preset" | "startFrame" | "durationInFrames" | "easing"
      >
    >,
  ): void {
    if (!layer || !selectedAnimation) return;
    onAnimationsChange(
      layer.animations.map((animation) =>
        animation.id === selectedAnimation.id
          ? { ...animation, ...patch }
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
              <h3>{presetLabel(selectedAnimation.preset)}</h3>
            </div>
          </header>

          <button
            type="button"
            className="animation-change-button"
            onClick={() => onAnimationSelect(null)}
          >
            Change animation
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

          <label className="animation-select-row">
            <span>Preset</span>
            <select
              aria-label="Animation preset"
              value={selectedAnimation.preset}
              onChange={(event) =>
                patchSelectedAnimation({
                  preset: event.currentTarget.value as AnimationPreset,
                })
              }
            >
              {PRESET_GROUPS.flatMap((group) => group.presets).map((preset) => (
                <option key={preset} value={preset}>
                  {presetLabel(preset)}
                </option>
              ))}
            </select>
          </label>

          <label className="animation-select-row">
            <span>Delivery</span>
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
                <option key={easing} value={easing}>
                  {presetLabel(easing)}
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
          {PRESET_GROUPS.map((group) => (
            <section className="animation-preset-group" key={group.title}>
              <h4>{group.title}</h4>
              <div className="animation-preset-grid">
                {group.presets.map((preset) => {
                  const existing = layer.animations.find(
                    (animation) => animation.phase === displayedPhase,
                  );
                  const isCurrent = existing?.preset === preset;
                  return (
                    <button
                      type="button"
                      key={preset}
                      className={isCurrent ? "is-current" : ""}
                      onClick={() => applyPreset(preset)}
                    >
                      <span className={`animation-preset-preview preset-${preset}`} />
                      <strong>{presetLabel(preset)}</strong>
                      {isCurrent ? <small>Current</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
