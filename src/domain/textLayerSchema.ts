import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'
import { TextStyleSchema } from './shapeTextSchema'

// Text layout rules shared by Fabric.js Adapter and Remotion Adapter:
// - width is the text box width used for wrapping.
// - height stores the actual rendered text box height for the current text.
// - When text, font, or text box width changes, the Fabric Adapter must
//   recompute height and keep it in sync with the domain model.
// - letterSpacing is stored in project pixels in the domain model;
//   the Fabric Adapter converts it to Fabric.js's per-character unit,
//   while the Remotion Adapter applies it directly in project pixels.
// - Fabric.js and Remotion must use the same font files and typography
//   properties.

const TextAutoResizeSchema = z.enum(['both', 'height', 'fixed'])

export const TextLayerSchema = LayerBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  autoResize: TextAutoResizeSchema.default('both'),
  ...TextStyleSchema.shape,
}).strict()

export type TextLayer = z.infer<typeof TextLayerSchema>
