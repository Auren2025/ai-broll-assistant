import { z } from 'zod'
import { LayerAnimationSchema } from './layerAnimationSchema'

export const BlendModeSchema = z.literal('normal')

export const StrokePositionSchema = z.literal('inside')

// Coordinate rules shared by Fabric.js Adapter and Remotion Adapter:
// - Canvas origin is the top-left corner (0, 0).
// - Top-level x and y are relative to the scene. Group child coordinates are
//   relative to the group's unrotated top-left corner.
// - width and height are the rendered size on the canvas. They are the
//   single source of truth for sizing; the inspector, drag-resize, and
//   renderers all read and write these directly.
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
// - Group and child transforms/animations compose hierarchically. Opacity is
//   multiplicative and child zIndex values are local to their group.

export const LayerBaseSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    rotation: z.number().finite(),
    opacity: z.number().finite().min(0).max(1),
    opacityEnabled: z.boolean().default(true),
    blendMode: BlendModeSchema.default('normal'),
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
