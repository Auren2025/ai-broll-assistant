import { z } from 'zod'
import { LayerBaseSchema, StrokePositionSchema } from './layerSchema'
import { DEFAULT_SHAPE_TEXT, ShapeTextSchema } from './shapeTextSchema'

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
  shapeText: ShapeTextSchema.default(DEFAULT_SHAPE_TEXT),
}).strict().superRefine((layer, context) => {
  if ((layer.donut !== 0 || layer.sweep !== 360) && layer.shapeText.text.trim().length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['shapeText', 'text'],
      message: 'Circle shape text requires donut=0 and sweep=360',
    })
  }
})

export type CircleLayer = z.infer<typeof CircleLayerSchema>
