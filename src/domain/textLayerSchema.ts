import { z } from 'zod'
import { LayerBaseSchema, StrokePositionSchema } from './layerSchema'

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
const TextVerticalAlignSchema = z.enum(['top', 'middle', 'bottom'])
const TextAutoResizeSchema = z.enum(['both', 'height', 'fixed'])
const TextCaseSchema = z.enum(['normal', 'uppercase', 'lowercase'])

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
  verticalAlign: TextVerticalAlignSchema.default('middle'),
  autoResize: TextAutoResizeSchema.default('both'),
  textCase: TextCaseSchema.default('normal'),
  kerningPairs: z.boolean().default(true),
  ligatures: z.boolean().default(true),
  fill: z.string().min(1),
  fillEnabled: z.boolean().default(true),
  stroke: z.string().min(1).nullable().default(null),
  strokeWidth: z.number().finite().nonnegative().default(0),
  strokePosition: StrokePositionSchema.default('inside'),
}).strict()

export type TextLayer = z.infer<typeof TextLayerSchema>
