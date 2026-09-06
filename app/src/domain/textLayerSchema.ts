import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'
import { TextStyleSchema } from './shapeTextSchema'

// Text layout rules shared by Fabric.js Adapter and Remotion Adapter:
// - autoResize "both" measures unwrapped content width and rendered height.
// - autoResize "height" keeps width as the wrapping width and measures height.
// - autoResize "fixed" keeps both domain dimensions and wraps within width;
//   standalone text is not clipped even when rendered content exceeds height.
// - When content or typography changes, the Fabric Adapter updates dimensions
//   allowed by the selected mode and keeps them in the domain model.
// - letterSpacing is stored in project pixels in the domain model;
//   the Fabric Adapter converts it to Fabric.js's per-character unit,
//   while the Remotion Adapter applies it directly in project pixels.
// - Fabric.js and Remotion must use the same font files, wrapping, and
//   typography properties.

const TextAutoResizeSchema = z.enum(['both', 'height', 'fixed'])

export const TextLayerSchema = LayerBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  autoResize: TextAutoResizeSchema.default('both'),
  ...TextStyleSchema.shape,
}).strict()

export type TextLayer = z.infer<typeof TextLayerSchema>
