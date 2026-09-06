import type {
  AnimationPhase,
  AnimationPreset,
  LayerAnimation,
} from "../domain/layerAnimationSchema";
import { isLineDrawEligible } from "../domain/lineDraw";
import type { Layer } from "../domain/sceneSchema";

export const ANIMATION_PHASE_OPTIONS = [
  { phase: "enter", label: "Build In" },
  { phase: "emphasis", label: "Action" },
  { phase: "exit", label: "Build Out" },
] as const satisfies readonly { phase: AnimationPhase; label: string }[];

const PRESET_LABELS = {
  "fade-and-move": "Fade and Move",
  "line-draw": "Line Draw",
  wipe: "Wipe",
  "dissolve-in": "Dissolve",
  "scale-in": "Scale",
  "scale-big": "Scale Big",
  "magic-move": "Magic Move",
  dissolve: "Dissolve",
} as const satisfies Record<AnimationPreset, string>;

const PRESET_PHASES = {
  "fade-and-move": "enter",
  "line-draw": "enter",
  wipe: "enter",
  "dissolve-in": "enter",
  "scale-in": "enter",
  "scale-big": "enter",
  "magic-move": "emphasis",
  dissolve: "exit",
} as const satisfies Record<AnimationPreset, AnimationPhase>;

const ENTER_PRESETS = [
  "fade-and-move",
  "dissolve-in",
  "wipe",
  "scale-in",
  "scale-big",
] as const satisfies readonly AnimationPreset[];

export function getAnimationPhaseLabel(phase: AnimationPhase): string {
  return ANIMATION_PHASE_OPTIONS.find((option) => option.phase === phase)?.label ?? phase;
}

export function getAnimationPresetLabel(preset: AnimationPreset): string {
  return PRESET_LABELS[preset];
}

export function getAnimationPhase(preset: AnimationPreset): AnimationPhase {
  return PRESET_PHASES[preset];
}

export function getAnimationPresets(
  layer: Layer,
  phase: AnimationPhase,
): readonly { preset: AnimationPreset; label: string }[] {
  const presets: readonly AnimationPreset[] =
    phase === "enter"
      ? [
          ...ENTER_PRESETS,
          ...(isLineDrawEligible(layer) ? (["line-draw"] as const) : []),
        ]
      : phase === "emphasis"
        ? ["magic-move"]
        : ["dissolve"];

  return presets.map((preset) => ({
    preset,
    label: getAnimationPresetLabel(preset),
  }));
}

function makeUniqueAnimationId(layer: Layer, phase: AnimationPhase): string {
  const existingIds = new Set(layer.animations.map((animation) => animation.id));
  const baseId = `${layer.id}-${phase}`;
  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function createDefaultAnimation(
  layer: Layer,
  preset: AnimationPreset,
  sceneDurationInFrames: number,
  fps: number,
): LayerAnimation {
  const durationInFrames = Math.min(fps, sceneDurationInFrames);
  const phase = getAnimationPhase(preset);
  const id = makeUniqueAnimationId(layer, phase);

  if (preset === "fade-and-move") {
    return {
      id,
      phase: "enter",
      preset,
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
      direction: "bottom-to-top",
      travelDistance: 40,
    };
  }

  if (preset === "line-draw") {
    return {
      id,
      phase: "enter",
      preset,
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
      direction: layer.type === "arrow" ? "start-to-end" : "clockwise",
    };
  }

  if (preset === "wipe") {
    return {
      id,
      phase: "enter",
      preset,
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
      direction: "left-to-right",
    };
  }

  if (preset === "dissolve-in" || preset === "scale-big") {
    return {
      id,
      phase: "enter",
      preset,
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
    };
  }

  if (preset === "scale-in") {
    return {
      id,
      phase: "enter",
      preset,
      startFrame: 0,
      durationInFrames,
      easing: "ease-out",
      direction: "up",
      bounce: false,
    };
  }

  if (preset === "dissolve") {
    return {
      id,
      phase: "exit",
      preset,
      startFrame: sceneDurationInFrames - durationInFrames,
      durationInFrames,
      easing: "ease-in-out",
    };
  }

  return {
    id,
    phase: "emphasis",
    preset,
    startFrame: Math.floor((sceneDurationInFrames - durationInFrames) / 2),
    durationInFrames,
    easing: "ease-in-out",
    translateX: 0,
    translateY: 0,
    scale: 1,
    opacity: 1,
  };
}
