import { z } from "zod";
import { StrokePositionSchema } from "./layerSchema";

export const TextFontStyleSchema = z.enum(["normal", "italic"]);
export const TextAlignSchema = z.enum(["left", "center", "right"]);
export const TextVerticalAlignSchema = z.enum(["top", "middle", "bottom"]);
export const TextCaseSchema = z.enum(["normal", "uppercase", "lowercase"]);

export const TextStyleSchema = z
  .object({
    fontFamily: z.string().min(1),
    fontSize: z.number().finite().positive(),
    fontWeight: z.number().int().min(100).max(900).multipleOf(100),
    fontStyle: TextFontStyleSchema,
    lineHeight: z.number().finite().positive(),
    letterSpacing: z.number().finite(),
    textAlign: TextAlignSchema,
    verticalAlign: TextVerticalAlignSchema.default("middle"),
    textCase: TextCaseSchema.default("normal"),
    kerningPairs: z.boolean().default(true),
    ligatures: z.boolean().default(true),
    fill: z.string().min(1),
    fillEnabled: z.boolean().default(true),
    stroke: z.string().min(1).nullable().default(null),
    strokeWidth: z.number().finite().nonnegative().default(0),
    strokePosition: StrokePositionSchema.default("inside"),
  })
  .strict();

export const ShapeTextSchema = TextStyleSchema.extend({
  text: z.string(),
  padding: z.number().finite().nonnegative(),
}).strict();

export const DEFAULT_SHAPE_TEXT: ShapeText = {
  text: "",
  fontFamily: "Arial",
  fontSize: 32,
  fontWeight: 400,
  fontStyle: "normal",
  lineHeight: 1.2,
  letterSpacing: 0,
  textAlign: "center",
  verticalAlign: "middle",
  textCase: "normal",
  kerningPairs: true,
  ligatures: true,
  fill: "#ffffff",
  fillEnabled: true,
  stroke: null,
  strokeWidth: 0,
  strokePosition: "inside",
  padding: 24,
};

export type TextStyle = z.infer<typeof TextStyleSchema>;
export type ShapeText = z.infer<typeof ShapeTextSchema>;
