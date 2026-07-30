import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

// Geometry rules shared by Fabric.js Adapter and Remotion Adapter:
// - width and height are the rectangle's base geometric size.
// - Stroke is drawn centered on the rectangle boundary, so it may extend
//   outward by strokeWidth / 2.
// - cornerRadius is the base corner radius before scale is applied.
// - At render time, the adapter must clamp cornerRadius to no more than
//   half of the rectangle's shorter side.

export const RectangleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('rectangle'),
  fill: z.string().min(1),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
  cornerRadius: z.number().finite().nonnegative(),
}).strict()

export type RectangleLayer = z.infer<typeof RectangleLayerSchema>
