import { z } from 'zod'
import { LayerBaseSchema } from './layerSchema'

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

const TextFontStyleSchema = z.enum(['normal', 'italic'])

const TextAlignSchema = z.enum(['left', 'center', 'right'])

export const TextLayerSchema = LayerBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().finite().positive(),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100),
  fontStyle: TextFontStyleSchema,
  lineHeight: z.number().finite().positive(),
  letterSpacing: z.number().finite(),
  textAlign: TextAlignSchema,
  fill: z.string().min(1),
}).strict()

export type TextLayer = z.infer<typeof TextLayerSchema>
