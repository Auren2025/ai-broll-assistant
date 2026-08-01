import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

export const TriangleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('triangle'),
  fill: z.string().min(1),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
}).strict()

export type TriangleLayer = z.infer<typeof TriangleLayerSchema>
