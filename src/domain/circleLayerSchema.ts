import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

export const CircleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('circle'),
  fill: z.string().min(1),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
}).strict()

export type CircleLayer = z.infer<typeof CircleLayerSchema>
