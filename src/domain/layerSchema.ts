import { z } from 'zod'
import { LayerAnimationSchema } from './layerAnimationSchema'

// Coordinate rules shared by Fabric.js Adapter and Remotion Adapter:
// - Canvas origin is the top-left corner (0, 0).
// - x and y are the top-left of the layer's unrotated bounding box.
// - width and height are the base size before scale is applied.
// - scaleX and scaleY are multipliers applied around the layer's center.
// - rotation is in degrees, applied around the layer's center.
// - opacity is in the range [0, 1].
//
// Animation rules:
// - animations is an array of LayerAnimation entries attached to this
//   layer. JSON must always spell the field explicitly (even as `[]`);
//   there is no implicit default.
// - Per-layer refinement (see superRefine below) enforces:
//   * animation ids are unique inside the same layer;
//   * at most one enter / one emphasis / one exit animation per layer.
// - Time-window enforcement against the parent Scene duration is done in
//   SceneSchema.superRefine; the layer itself only knows local frame
//   numbers.

export const LayerBaseSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    scaleX: z.number().finite().positive(),
    scaleY: z.number().finite().positive(),
    rotation: z.number().finite(),
    opacity: z.number().finite().min(0).max(1),
    zIndex: z.number().int().nonnegative(),
    visible: z.boolean(),
    locked: z.boolean(),
    animations: z.array(LayerAnimationSchema),
  })
  .strict()
  .superRefine((layer, context) => {
    const animationIds = new Set<string>()
    const phasesSeen = new Set<string>()

    layer.animations.forEach((animation, index) => {
      if (animationIds.has(animation.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate animation id: ${animation.id}`,
          path: ['animations', index, 'id'],
        })
      } else {
        animationIds.add(animation.id)
      }

      if (phasesSeen.has(animation.phase)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate animation phase: ${animation.phase}`,
          path: ['animations', index, 'phase'],
        })
      } else {
        phasesSeen.add(animation.phase)
      }
    })
  })

export type LayerBase = z.infer<typeof LayerBaseSchema>