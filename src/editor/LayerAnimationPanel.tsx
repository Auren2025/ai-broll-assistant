import type { Layer } from "../domain/sceneSchema";
import type {
  AnimationEasing,
  AnimationPhase,
  AnimationPreset,
  LayerAnimation,
} from "../domain/layerAnimationSchema";

const ANIMATION_PRESETS = [
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "scale",
] as const satisfies readonly AnimationPreset[];

const ANIMATION_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
] as const satisfies readonly AnimationEasing[];

type PhaseAnimationPatch = Partial<
  Pick<
    LayerAnimation,
    "preset" | "startFrame" | "durationInFrames" | "easing"
  >
>;

interface LayerAnimationPanelProps {
  layer: Layer | null;
  sceneDurationInFrames: number;
  onAnimationsChange: (animations: LayerAnimation[]) => void;
}

function makeUniquePhaseAnimationId(
  layer: Layer,
  phase: AnimationPhase,
): string {
  const existingIds = new Set(
    layer.animations.map((animation) => animation.id),
  );

  const baseId = `${layer.id}-${phase}`;

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;

  while (existingIds.has(`${layer.id}-${phase}-${suffix}`)) {
    suffix += 1;
  }

  return `${layer.id}-${phase}-${suffix}`;
}

function defaultPhaseAnimation(
  phase: AnimationPhase,
  sceneDurationInFrames: number,
): Omit<LayerAnimation, "id"> {
  if (phase === "enter") {
    return {
      phase: "enter",
      preset: "fade",
      startFrame: 0,
      durationInFrames: Math.min(20, sceneDurationInFrames),
      easing: "ease-out",
    };
  }

  if (phase === "exit") {
    return {
      phase: "exit",
      preset: "fade",
      startFrame: Math.max(0, sceneDurationInFrames - 20),
      durationInFrames: Math.min(20, sceneDurationInFrames),
      easing: "ease-in",
    };
  }

  const emphasisDuration = Math.min(24, sceneDurationInFrames);

  return {
    phase: "emphasis",
    preset: "scale",
    startFrame: Math.floor(
      (sceneDurationInFrames - emphasisDuration) / 2,
    ),
    durationInFrames: emphasisDuration,
    easing: "ease-in-out",
  };
}

function phaseLabel(phase: AnimationPhase): string {
  switch (phase) {
    case "enter":
      return "Enter";
    case "exit":
      return "Exit";
    case "emphasis":
      return "Emphasis";
  }
}

interface PhaseEditorProps {
  phase: AnimationPhase;
  animation: LayerAnimation | null;
  layer: Layer;
  sceneDurationInFrames: number;
  onAnimationsChange: (animations: LayerAnimation[]) => void;
}

function PhaseEditor({
  phase,
  animation,
  layer,
  sceneDurationInFrames,
  onAnimationsChange,
}: PhaseEditorProps) {
  function patchPhaseAnimation(patch: PhaseAnimationPatch): void {
    if (!animation) {
      return;
    }

    const updatedAnimations = layer.animations.map((candidate) => {
      if (candidate.phase !== phase) {
        return candidate;
      }

      const nextAnimation: LayerAnimation = {
        id: candidate.id,
        phase: candidate.phase,
        preset: patch.preset ?? candidate.preset,
        startFrame: patch.startFrame ?? candidate.startFrame,
        durationInFrames:
          patch.durationInFrames ?? candidate.durationInFrames,
        easing: patch.easing ?? candidate.easing,
      };

      return nextAnimation;
    });

    onAnimationsChange(updatedAnimations);
  }

  function handleAddPhaseAnimation(): void {
    const newAnimation: LayerAnimation = {
      id: makeUniquePhaseAnimationId(layer, phase),
      ...defaultPhaseAnimation(phase, sceneDurationInFrames),
    };

    onAnimationsChange([...layer.animations, newAnimation]);
  }

  function handleRemovePhaseAnimation(): void {
    onAnimationsChange(
      layer.animations.filter(
        (candidate) => candidate.phase !== phase,
      ),
    );
  }

  function handleStartFrameChange(value: number): void {
    if (!Number.isFinite(value) || !animation) {
      return;
    }

    const nextStartFrame = Math.min(
      Math.max(0, Math.trunc(value)),
      sceneDurationInFrames - 1,
    );

    const maximumDuration =
      sceneDurationInFrames - nextStartFrame;

    const nextDuration = Math.min(
      animation.durationInFrames,
      maximumDuration,
    );

    patchPhaseAnimation({
      startFrame: nextStartFrame,
      durationInFrames: Math.max(1, nextDuration),
    });
  }

  function handleDurationChange(value: number): void {
    if (!Number.isFinite(value) || !animation) {
      return;
    }

    const maximumDuration =
      sceneDurationInFrames - animation.startFrame;

    const nextDuration = Math.min(
      maximumDuration,
      Math.max(1, Math.trunc(value)),
    );

    patchPhaseAnimation({
      durationInFrames: nextDuration,
    });
  }

  if (!animation) {
    return (
      <div className="animation-card">
        <p className="app-stage">No {phase} animation.</p>

        <button type="button" onClick={handleAddPhaseAnimation}>
          Add {phase} animation
        </button>
      </div>
    );
  }

  const endFrame = animation.startFrame + animation.durationInFrames;

  const startAria = `${phase} animation start frame`;
  const durationAria = `${phase} animation duration`;
  const easingAria = `${phase} animation easing`;
  const presetAria = `${phase} animation preset`;

  return (
    <div className="animation-card">
      <label>
        {phaseLabel(phase)} preset
        <select
          aria-label={presetAria}
          value={animation.preset}
          onChange={(event) => {
            const nextPreset = event.currentTarget.value as AnimationPreset;

            patchPhaseAnimation({
              preset: nextPreset,
            });
          }}
        >
          {ANIMATION_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
      </label>

      <label>
        Start frame
        <input
          type="number"
          min={0}
          max={sceneDurationInFrames - 1}
          step={1}
          value={animation.startFrame}
          aria-label={startAria}
          onChange={(event) => {
            handleStartFrameChange(event.currentTarget.valueAsNumber);
          }}
        />
      </label>

      <label>
        Duration
        <input
          type="number"
          min={1}
          max={sceneDurationInFrames - animation.startFrame}
          step={1}
          value={animation.durationInFrames}
          aria-label={durationAria}
          onChange={(event) => {
            handleDurationChange(event.currentTarget.valueAsNumber);
          }}
        />
      </label>

      <label>
        Easing
        <select
          aria-label={easingAria}
          value={animation.easing}
          onChange={(event) => {
            const nextEasing = event.currentTarget.value as AnimationEasing;

            patchPhaseAnimation({
              easing: nextEasing,
            });
          }}
        >
          {ANIMATION_EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {easing}
            </option>
          ))}
        </select>
      </label>

      <p className="app-stage">
        End frame: {endFrame} / {sceneDurationInFrames}
      </p>

      <button type="button" onClick={handleRemovePhaseAnimation}>
        Remove {phase} animation
      </button>
    </div>
  );
}

export function LayerAnimationPanel({
  layer,
  sceneDurationInFrames,
  onAnimationsChange,
}: LayerAnimationPanelProps) {
  if (layer === null) {
    return (
      <p className="app-stage">Select a layer to edit animations.</p>
    );
  }

  const enterAnimation =
    layer.animations.find(
      (animation) => animation.phase === "enter",
    ) ?? null;

  const emphasisAnimation =
    layer.animations.find(
      (animation) => animation.phase === "emphasis",
    ) ?? null;

  const exitAnimation =
    layer.animations.find(
      (animation) => animation.phase === "exit",
    ) ?? null;

  return (
    <section className="inspector-panel" aria-label="Layer animations">
      <h3>Animation phases</h3>

      <div className="animation-stack">
        <PhaseEditor
          phase="enter"
          animation={enterAnimation}
          layer={layer}
          sceneDurationInFrames={sceneDurationInFrames}
          onAnimationsChange={onAnimationsChange}
        />

        <PhaseEditor
          phase="emphasis"
          animation={emphasisAnimation}
          layer={layer}
          sceneDurationInFrames={sceneDurationInFrames}
          onAnimationsChange={onAnimationsChange}
        />

        <PhaseEditor
          phase="exit"
          animation={exitAnimation}
          layer={layer}
          sceneDurationInFrames={sceneDurationInFrames}
          onAnimationsChange={onAnimationsChange}
        />
      </div>
    </section>
  );
}
