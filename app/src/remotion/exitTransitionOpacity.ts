/**
 * Pure math for scene exit transitions. Frames are local to the scene:
 * frame 0 is the scene's first frame.
 *
 * Exit transitions are outros only: they play over the tail of the scene's
 * own duration and never overlap the next scene (no crossfades). The fade
 * reaches 0 exactly on the scene's last frame.
 */
export function getExitTransitionOpacity(
  frame: number,
  sceneDurationInFrames: number,
  transitionDurationInFrames: number,
): number {
  const sceneFrames = Math.max(0, Math.floor(sceneDurationInFrames));
  const transitionFrames = Math.min(
    Math.max(0, Math.floor(transitionDurationInFrames)),
    sceneFrames,
  );
  if (transitionFrames <= 0 || sceneFrames <= 1) return 1;
  const fadeStart = sceneFrames - transitionFrames;
  const lastFrame = sceneFrames - 1;
  if (frame <= fadeStart) return 1;
  if (frame >= lastFrame) return 0;
  return 1 - (frame - fadeStart) / (lastFrame - fadeStart);
}
