import { z } from "zod";
import { LayerBaseSchema, StrokePositionSchema } from "./layerSchema";

// Image layer rules shared by Fabric.js Adapter and Remotion Adapter:
// - `src` is null while the image is an unfilled placeholder. Otherwise it is
//   the project-relative path of the asset (e.g. "assets/<id>.png") under the
//   owning project directory. Absolute paths are not allowed.
// - Editor, preview, Studio, and video rendering load the same file through
//   the local service URL derived from `src`. Offline HTML uses the copied
//   project-relative asset under its export directory.
// - `cornerRadius` is the base corner radius applied to all four corners
//   before scale is applied. The adapter clamps it to half the shorter
//   side of the layer at render time.
// - `stroke` is the outline color (CSS hex) or null when the outline is
//   disabled; `strokeWidth` is the outline thickness in project pixels and
//   is always present even when stroke is null.
// - `placeholderColor` is rendered only while `src` is null. Loaded images
//   never use it as a background or tint.

const ASSET_PATH_PATTERN = /^assets\/[A-Za-z0-9_.-]+$/;

export const ImageFitSchema = z.enum(["fill", "contain"]);

export const ImageLayerSchema = LayerBaseSchema.extend({
  type: z.literal("image"),
  src: z
    .string()
    .regex(ASSET_PATH_PATTERN, "Image src must match assets/<file>")
    .nullable()
    .default(null),
  // Existing persisted images omitted this field and used stretched rendering.
  // Keep that behavior while new placeholders explicitly opt into contain.
  fit: ImageFitSchema.default("fill"),
  placeholderColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#d1d5db"),
  cornerRadius: z.number().finite().nonnegative().default(0),
  stroke: z.union([z.string().min(1), z.null()]).default(null),
  strokeWidth: z.number().finite().nonnegative().default(0),
  strokePosition: StrokePositionSchema.default("inside"),
}).strict();

export type ImageLayer = z.infer<typeof ImageLayerSchema>;

export function parseImageLayer(input: unknown): ImageLayer {
  return ImageLayerSchema.parse(input);
}
