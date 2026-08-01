import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

// Line layer rules shared by Fabric.js Adapter and Remotion Adapter:
// - stroke is the line color and is required.
// - strokeWidth is the line's thickness in project pixels.
// - The line is drawn horizontally at the vertical center of the
//   (x, y, width, height) bounding box defined on LayerBase.
// - The bounding box height is independent of strokeWidth and exists so
//   the layer can be positioned, scaled and aligned with other layers.

export const LineLayerSchema = LayerBaseSchema.extend({
  type: z.literal('line'),
  stroke: z.string().min(1),
  strokeWidth: z.number().finite().min(1),
}).strict()

export type LineLayer = z.infer<typeof LineLayerSchema>