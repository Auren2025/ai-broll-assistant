import { z } from 'zod'

// Coordinate rules shared by Fabric.js Adapter and Remotion Adapter:
// - Canvas origin is the top-left corner (0, 0).
// - x and y are the top-left of the layer's unrotated bounding box.
// - width and height are the base size before scale is applied.
// - scaleX and scaleY are multipliers applied around the layer's center.
// - rotation is in degrees, applied around the layer's center.
// - opacity is in the range [0, 1].

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
  })
  .strict()

export type LayerBase = z.infer<typeof LayerBaseSchema>
