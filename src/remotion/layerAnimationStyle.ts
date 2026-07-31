import { Easing, interpolate } from "remotion";
import type {
  AnimationEasing,
  AnimationPreset,
  LayerAnimation,
} from "../domain/layerAnimationSchema";

export interface LayerAnimationStyle {
  opacityMultiplier: number;
  translateX: number;
  translateY: number;
  scale: number;
}

const NEUTRAL_ANIMATION_STYLE: LayerAnimationStyle = {
  opacityMultiplier: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
};

function resolveEasing(
  easing: AnimationEasing,
): (value: number) => number {
  switch (easing) {
    case "linear":
      return (value: number) => value;
    case "ease-in":
      return Easing.in(Easing.cubic);
    case "ease-out":
      return Easing.out(Easing.cubic);
    case "ease-in-out":
      return Easing.inOut(Easing.cubic);
  }
}

function applyEnterPreset(
  preset: AnimationPreset,
  progress: number,
): LayerAnimationStyle {
  switch (preset) {
    case "fade":
      return {
        opacityMultiplier: progress,
        translateX: 0,
        translateY: 0,
        scale: 1,
      };
    case "slide-up":
      return {
        opacityMultiplier: progress,
        translateX: 0,
        translateY: 80 * (1 - progress),
        scale: 1,
      };
    case "slide-down":
      return {
        opacityMultiplier: progress,
        translateX: 0,
        translateY: -80 * (1 - progress),
        scale: 1,
      };
    case "slide-left":
      return {
        opacityMultiplier: progress,
        translateX: 120 * (1 - progress),
        translateY: 0,
        scale: 1,
      };
    case "slide-right":
      return {
        opacityMultiplier: progress,
        translateX: -120 * (1 - progress),
        translateY: 0,
        scale: 1,
      };
    case "scale":
      return {
        opacityMultiplier: progress,
        translateX: 0,
        translateY: 0,
        scale: 0.85 + 0.15 * progress,
      };
  }
}

export function getLayerEnterAnimationStyle(
  animations: readonly LayerAnimation[],
  frame: number,
): LayerAnimationStyle {
  const animation = animations.find(
    (candidate) => candidate.phase === "enter",
  );

  if (!animation) {
    return NEUTRAL_ANIMATION_STYLE;
  }

  const resolvedEasing = resolveEasing(animation.easing);

  const progress = interpolate(
    frame,
    [
      animation.startFrame,
      animation.startFrame + animation.durationInFrames,
    ],
    [0, 1],
    {
      easing: resolvedEasing,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return applyEnterPreset(animation.preset, progress);
}
