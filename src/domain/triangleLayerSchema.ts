import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

export const TriangleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('triangle'),
  fill: z.string().min(1),
  fillEnabled: z.boolean().default(true),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
  cornerEnabled: z.boolean().default(true),
  cornerRadius: z.number().finite().nonnegative().default(0),
}).strict()

export type TriangleLayer = z.infer<typeof TriangleLayerSchema>
