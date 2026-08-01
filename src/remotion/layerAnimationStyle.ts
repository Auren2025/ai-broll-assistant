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

function applyExitPreset(
  preset: AnimationPreset,
  progress: number,
): LayerAnimationStyle {
  switch (preset) {
    case "fade":
      return {
        opacityMultiplier: 1 - progress,
        translateX: 0,
        translateY: 0,
        scale: 1,
      };
    case "slide-up":
      return {
        opacityMultiplier: 1 - progress,
        translateX: 0,
        translateY: -80 * progress,
        scale: 1,
      };
    case "slide-down":
      return {
        opacityMultiplier: 1 - progress,
        translateX: 0,
        translateY: 80 * progress,
        scale: 1,
      };
    case "slide-left":
      return {
        opacityMultiplier: 1 - progress,
        translateX: -120 * progress,
        translateY: 0,
        scale: 1,
      };
    case "slide-right":
      return {
        opacityMultiplier: 1 - progress,
        translateX: 120 * progress,
        translateY: 0,
        scale: 1,
      };
    case "scale":
      return {
        opacityMultiplier: 1 - progress,
        translateX: 0,
        translateY: 0,
        scale: 1 - 0.15 * progress,
      };
  }
}

function getPhaseAnimationStyle(
  animations: readonly LayerAnimation[],
  phase: "enter" | "exit",
  frame: number,
): LayerAnimationStyle {
  const animation = animations.find(
    (candidate) => candidate.phase === phase,
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

  return phase === "enter"
    ? applyEnterPreset(animation.preset, progress)
    : applyExitPreset(animation.preset, progress);
}

export function getLayerEnterAnimationStyle(
  animations: readonly LayerAnimation[],
  frame: number,
): LayerAnimationStyle {
  return getPhaseAnimationStyle(animations, "enter", frame);
}

export function getLayerExitAnimationStyle(
  animations: readonly LayerAnimation[],
  frame: number,
): LayerAnimationStyle {
  return getPhaseAnimationStyle(animations, "exit", frame);
}

export function getLayerAnimationStyle(
  animations: readonly LayerAnimation[],
  frame: number,
): LayerAnimationStyle {
  const enter = getPhaseAnimationStyle(animations, "enter", frame);
  const exit = getPhaseAnimationStyle(animations, "exit", frame);

  return {
    opacityMultiplier: enter.opacityMultiplier * exit.opacityMultiplier,
    translateX: enter.translateX + exit.translateX,
    translateY: enter.translateY + exit.translateY,
    scale: enter.scale * exit.scale,
  };
}
