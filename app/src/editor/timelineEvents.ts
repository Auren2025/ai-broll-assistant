import type { LayerAnimation } from "../domain/layerAnimationSchema";
import type { Layer } from "../domain/sceneSchema";

export interface TimelineEvent {
  layer: Layer;
  animation: LayerAnimation;
  depth: number;
  locked: boolean;
}

/**
 * Build the animation timeline rows. The row order follows the scene
 * stacking order (zIndex desc) so the list always matches the layer panel
 * and the resulting z-order / occlusion relationship is unambiguous.
 * Dragging an animation on the timeline only changes its time, never its
 * row. Animations within a single layer are still sorted by startFrame so
 * phases line up (enter → emphasis → exit); group children come after the
 * group's own animations, ordered by their own zIndex.
 */
export function getTimelineEvents(layers: readonly Layer[]): TimelineEvent[] {
  return [...layers]
    .sort((first, second) => second.zIndex - first.zIndex)
    .flatMap((layer) => {
      const groupEvents = [...layer.animations]
        .sort((first, second) => first.startFrame - second.startFrame)
        .map((animation) => ({ layer, animation, depth: 0, locked: layer.locked }));

      if (layer.type !== "group") {
        return groupEvents;
      }

      const childEvents = [...layer.children]
        .sort((first, second) => second.zIndex - first.zIndex)
        .flatMap((child) =>
          [...child.animations]
            .sort((first, second) => first.startFrame - second.startFrame)
            .map((animation) => ({
              layer: child,
              animation,
              depth: 1,
              locked: layer.locked || child.locked,
            })),
        );

      return [...groupEvents, ...childEvents];
    });
}
