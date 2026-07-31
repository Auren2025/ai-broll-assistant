import type { Layer } from "../domain/sceneSchema";
import type {
  AnimationEasing,
  AnimationPreset,
  LayerAnimation,
} from "../domain/layerAnimationSchema";

const ENTER_PRESETS = [
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

type EnterAnimationPatch = Partial<
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

function makeUniqueEnterAnimationId(
  layer: Layer,
): string {
  const existingIds = new Set(layer.animations.map((animation) => animation.id));

  const baseId = `${layer.id}-enter`;

  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;

  while (existingIds.has(`${layer.id}-enter-${suffix}`)) {
    suffix += 1;
  }

  return `${layer.id}-enter-${suffix}`;
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

  function patchEnterAnimation(patch: EnterAnimationPatch): void {
    if (!layer || !enterAnimation) {
      return;
    }

    const updatedAnimations = layer.animations.map((animation) => {
      if (animation.phase !== "enter") {
        return animation;
      }

      const nextAnimation: LayerAnimation = {
        id: animation.id,
        phase: animation.phase,
        preset: patch.preset ?? animation.preset,
        startFrame: patch.startFrame ?? animation.startFrame,
        durationInFrames:
          patch.durationInFrames ?? animation.durationInFrames,
        easing: patch.easing ?? animation.easing,
      };

      return nextAnimation;
    });

    onAnimationsChange(updatedAnimations);
  }

  function handleAddEnterAnimation(): void {
    if (!layer) {
      return;
    }

    const newAnimation: LayerAnimation = {
      id: makeUniqueEnterAnimationId(layer),
      phase: "enter",
      preset: "fade",
      startFrame: 0,
      durationInFrames: Math.min(20, sceneDurationInFrames),
      easing: "ease-out",
    };

    onAnimationsChange([...layer.animations, newAnimation]);
  }

  function handleRemoveEnterAnimation(): void {
    if (!layer) {
      return;
    }

    onAnimationsChange(
      layer.animations.filter(
        (animation) => animation.phase !== "enter",
      ),
    );
  }

  function handleStartFrameChange(value: number): void {
    if (!Number.isFinite(value) || !enterAnimation) {
      return;
    }

    const nextStartFrame = Math.min(
      sceneDurationInFrames - 1,
      Math.max(0, Math.trunc(value)),
    );

    const maximumDuration =
      sceneDurationInFrames - nextStartFrame;

    const nextDuration = Math.min(
      enterAnimation.durationInFrames,
      maximumDuration,
    );

    patchEnterAnimation({
      startFrame: nextStartFrame,
      durationInFrames: nextDuration,
    });
  }

  function handleDurationChange(value: number): void {
    if (!Number.isFinite(value) || !enterAnimation) {
      return;
    }

    const maximumDuration =
      sceneDurationInFrames - enterAnimation.startFrame;

    const nextDuration = Math.min(
      maximumDuration,
      Math.max(1, Math.trunc(value)),
    );

    patchEnterAnimation({
      durationInFrames: nextDuration,
    });
  }

  if (!enterAnimation) {
    return (
      <section aria-label="Layer animations">
        <h3>Animations</h3>

        <p className="app-stage">No enter animation.</p>

        <button type="button" onClick={handleAddEnterAnimation}>
          Add enter animation
        </button>
      </section>
    );
  }

  const endFrame =
    enterAnimation.startFrame + enterAnimation.durationInFrames;

  return (
    <section aria-label="Layer animations">
      <h3>Animations</h3>

      <label>
        Enter preset
        <select
          aria-label="Enter animation preset"
          value={enterAnimation.preset}
          onChange={(event) => {
            const nextPreset = event.currentTarget.value as AnimationPreset;

            patchEnterAnimation({
              preset: nextPreset,
            });
          }}
        >
          {ENTER_PRESETS.map((preset) => (
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
          value={enterAnimation.startFrame}
          aria-label="Enter animation start frame"
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
          max={sceneDurationInFrames - enterAnimation.startFrame}
          step={1}
          value={enterAnimation.durationInFrames}
          aria-label="Enter animation duration"
          onChange={(event) => {
            handleDurationChange(event.currentTarget.valueAsNumber);
          }}
        />
      </label>

      <label>
        Easing
        <select
          aria-label="Enter animation easing"
          value={enterAnimation.easing}
          onChange={(event) => {
            const nextEasing = event.currentTarget.value as AnimationEasing;

            patchEnterAnimation({
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

      <button type="button" onClick={handleRemoveEnterAnimation}>
        Remove enter animation
      </button>
    </section>
  );
}
