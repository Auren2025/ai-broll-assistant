import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

// Arrow layer rules shared by Fabric.js Adapter and Remotion Adapter:
// - The arrow always points from left to right inside the
//   (x, y, width, height) bounding box defined on LayerBase.
// - The shaft is a horizontal bar at the vertical center of the bounding
//   box, spanning x in [0, width - arrowHeadSize].
// - The arrowhead is a triangle anchored at (width - arrowHeadSize, 0)
//   and (width - arrowHeadSize, height), pointing to (width, height / 2).
// - stroke is the color of the shaft and arrowhead and is required.
// - strokeWidth is the thickness of the shaft in project pixels.
// - arrowHeadSize is the horizontal extent of the arrowhead in project
//   pixels; it is clamped at render time to no more than min(width,
//   height).

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
