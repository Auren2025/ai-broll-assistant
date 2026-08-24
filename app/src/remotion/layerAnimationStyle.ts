import { Easing, interpolate } from "remotion";
import type {
  AnimationEasing,
  LayerAnimation,
} from "../domain/layerAnimationSchema";

export interface LayerAnimationStyle {
  opacityMultiplier: number;
  translateX: number;
  translateY: number;
  scale: number;
}

export interface AnimationLayerDimensions {
  width: number;
  height: number;
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

function getAnimationProgress(
  animation: LayerAnimation,
  frame: number,
): number {
  if (animation.durationInFrames === 1) {
    return frame < animation.startFrame ? 0 : 1;
  }

  return interpolate(
    frame,
    [
      animation.startFrame,
      animation.startFrame + animation.durationInFrames - 1,
    ],
    [0, 1],
    {
      easing: resolveEasing(animation.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

function getFadeAndMoveStyle(
  animation: Extract<LayerAnimation, { preset: "fade-and-move" }>,
  frame: number,
  dimensions: AnimationLayerDimensions,
): LayerAnimationStyle {
  const progress = getAnimationProgress(animation, frame);
  const horizontal =
    animation.direction === "left-to-right" ||
    animation.direction === "right-to-left";
  const distance =
    ((horizontal ? dimensions.width : dimensions.height) *
      animation.travelDistance) /
    100;
  const remainingDistance = distance * (1 - progress);

  return {
    opacityMultiplier: progress,
    translateX:
      animation.direction === "left-to-right"
        ? -remainingDistance
        : animation.direction === "right-to-left"
          ? remainingDistance
          : 0,
    translateY:
      animation.direction === "top-to-bottom"
        ? -remainingDistance
        : animation.direction === "bottom-to-top"
          ? remainingDistance
          : 0,
    scale: 1,
  };
}

function getMagicMoveStyle(
  animation: Extract<LayerAnimation, { preset: "magic-move" }>,
  frame: number,
): LayerAnimationStyle {
  const progress = getAnimationProgress(animation, frame);

  return {
    opacityMultiplier: 1 + (animation.opacity - 1) * progress,
    translateX: animation.translateX * progress,
    translateY: animation.translateY * progress,
    scale: 1 + (animation.scale - 1) * progress,
  };
}

function getDissolveStyle(
  animation: Extract<LayerAnimation, { preset: "dissolve" }>,
  frame: number,
): LayerAnimationStyle {
  return {
    ...NEUTRAL_ANIMATION_STYLE,
    opacityMultiplier: 1 - getAnimationProgress(animation, frame),
  };
}

export function getLayerAnimationStyle(
  animations: readonly LayerAnimation[],
  frame: number,
  dimensions: AnimationLayerDimensions,
): LayerAnimationStyle {
  const buildIn = animations.find(
    (animation): animation is Extract<LayerAnimation, { preset: "fade-and-move" }> =>
      animation.preset === "fade-and-move",
  );
  const action = animations.find(
    (animation): animation is Extract<LayerAnimation, { preset: "magic-move" }> =>
      animation.preset === "magic-move",
  );
  const buildOut = animations.find(
    (animation): animation is Extract<LayerAnimation, { preset: "dissolve" }> =>
      animation.preset === "dissolve",
  );
  const buildInStyle = buildIn
    ? getFadeAndMoveStyle(buildIn, frame, dimensions)
    : NEUTRAL_ANIMATION_STYLE;
  const actionStyle = action
    ? getMagicMoveStyle(action, frame)
    : NEUTRAL_ANIMATION_STYLE;
  const buildOutStyle = buildOut
    ? getDissolveStyle(buildOut, frame)
    : NEUTRAL_ANIMATION_STYLE;

  return {
    opacityMultiplier:
      buildInStyle.opacityMultiplier *
      actionStyle.opacityMultiplier *
      buildOutStyle.opacityMultiplier,
    translateX: buildInStyle.translateX + actionStyle.translateX,
    translateY: buildInStyle.translateY + actionStyle.translateY,
    scale: actionStyle.scale,
  };
}
