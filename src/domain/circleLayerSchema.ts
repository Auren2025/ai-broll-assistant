import { z } from 'zod'
import { LayerBaseSchema, StrokePositionSchema } from './layerSchema'

export const CircleLayerSchema = LayerBaseSchema.extend({
  type: z.literal('circle'),
  fill: z.string().min(1),
  fillEnabled: z.boolean().default(true),
  stroke: z.union([z.string().min(1), z.null()]),
  strokeWidth: z.number().finite().nonnegative(),
  strokePosition: StrokePositionSchema.default('inside'),
  donut: z.number().finite().min(0).max(1).default(0),
  sweep: z.number().finite().min(0).max(360).default(360),
  startAngle: z.number().finite().default(0),
}).strict()

export type CircleLayer = z.infer<typeof CircleLayerSchema>
