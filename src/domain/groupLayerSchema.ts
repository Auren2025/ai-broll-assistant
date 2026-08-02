import { z } from "zod";
import { AtomicLayerSchema } from "./atomicLayerSchema";
import { LayerBaseSchema } from "./layerSchema";

export const GroupLayerSchema = LayerBaseSchema.extend({
  type: z.literal("group"),
  children: z.array(AtomicLayerSchema).min(2),
}).strict();

export type GroupLayer = z.infer<typeof GroupLayerSchema>;