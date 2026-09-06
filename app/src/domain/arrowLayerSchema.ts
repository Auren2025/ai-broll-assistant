import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

// Arrow layer rules shared by Fabric.js Adapter and Remotion Adapter:
// - The arrow uses a horizontal axis inside the (x, y, width, height)
//   bounding box. Rotation on LayerBase controls its final direction.
// - The shaft runs between the insets required by the configured start and
//   end heads at the vertical center of the box.
// - Each end independently supports none, triangle, line, diamond, or circle.
// - stroke is the color of the shaft and heads and is required.
// - strokeWidth is the thickness of the shaft in project pixels.
// - arrowHeadSize is the head extent in project pixels and is clamped at
//   render time to no more than half the layer width.

export const ArrowLayerSchema = LayerBaseSchema.extend({
  type: z.literal('arrow'),
  stroke: z.string().min(1),
  strokeWidth: z.number().finite().min(1),
  arrowHeadSize: z.number().finite().min(4),
  arrowStartStyle: z
    .enum(['none', 'triangle', 'line', 'diamond', 'circle'])
    .default('none'),
  arrowEndStyle: z
    .enum(['none', 'triangle', 'line', 'diamond', 'circle'])
    .default('triangle'),
}).strict()

export type ArrowLayer = z.infer<typeof ArrowLayerSchema>
