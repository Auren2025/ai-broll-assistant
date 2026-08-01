import { z } from "zod";
import { AtomicLayerSchema } from "./atomicLayerSchema";
import { LayerBaseSchema } from "./layerSchema";

export const GroupLayerSchema = LayerBaseSchema.extend({
  type: z.literal("group"),
  children: z.array(AtomicLayerSchema).min(2),
})
  .strict()
  .refine((group) => Math.abs(group.scaleX - group.scaleY) < 0.000001, {
    message: "Group scaleX and scaleY must be equal",
    path: ["scaleY"],
  });

export type GroupLayer = z.infer<typeof GroupLayerSchema>;
