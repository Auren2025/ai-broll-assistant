import { z } from 'zod'
import { LayerBaseSchema, StrokePositionSchema } from './layerSchema'
import { DEFAULT_SHAPE_TEXT, ShapeTextSchema } from './shapeTextSchema'

// Geometry rules shared by Fabric.js Adapter and Remotion Adapter:
// - width and height are the rectangle's base geometric size.
// - Stroke uses the only supported position, inside, so it remains within
//   the rectangle's visual bounds.
// - cornerRadius or cornerRadii stores the per-corner project-pixel radius.
// - At render time, adapters clamp radii to the available geometry.

export const RectangleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('rectangle'),
  fill: z.string().min(1),
  fillEnabled: z.boolean().default(true),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
  strokePosition: StrokePositionSchema.default('inside'),
  cornerEnabled: z.boolean().default(true),
  cornerRadius: z.number().finite().nonnegative(),
  cornerRadii: z
    .object({
      topLeft: z.number().finite().nonnegative(),
      topRight: z.number().finite().nonnegative(),
      bottomRight: z.number().finite().nonnegative(),
      bottomLeft: z.number().finite().nonnegative(),
    })
    .strict()
    .nullable()
    .default(null),
  shapeText: ShapeTextSchema.default(DEFAULT_SHAPE_TEXT),
}).strict()

export type RectangleLayer = z.infer<typeof RectangleLayerSchema>
