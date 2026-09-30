import type { Layer, Scene } from "../domain/sceneSchema";

export interface PlaybackStep {
  /** Scene-local frame where this step starts playing (inclusive). */
  startFrame: number;
  /** Scene-local frame where this step pauses (exclusive). */
  endFrame: number;
}

function collectAnimationStartFrames(layers: Layer[], starts: number[]): void {
  for (const layer of layers) {
    for (const animation of layer.animations) {
      starts.push(animation.startFrame);
    }
    if (layer.type === "group") {
      collectAnimationStartFrames(layer.children, starts);
    }
  }
}

/**
 * Split a scene's timeline into click-to-advance playback steps for the
 * exported HTML presentation.
 *
 * Every distinct animation start frame opens a new step: all animations that
 * begin at the same scene-local frame belong to the same step. Steps are
 * derived from timing alone, so no authoring-time build list is needed —
 * staggering animations on the editor timeline is already how steps are
 * authored.
 *
 * A scene with no animations yields no steps; the player then advances
 * straight to the next page on click.
 */
export function computePlaybackSteps(scene: Scene): PlaybackStep[] {
  const starts: number[] = [];
  collectAnimationStartFrames(scene.layers, starts);
  const boundaries = [...new Set(starts)].sort((a, b) => a - b);
  const steps: PlaybackStep[] = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    const startFrame = boundaries[index];
    const endFrame =
      index + 1 < boundaries.length
        ? boundaries[index + 1]
        : scene.durationInFrames;
    if (endFrame > startFrame) {
      steps.push({ startFrame, endFrame });
    }
  }
  return steps;
}
