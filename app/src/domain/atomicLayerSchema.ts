import { z } from "zod";
import { ArrowLayerSchema } from "./arrowLayerSchema";
import { CircleLayerSchema } from "./circleLayerSchema";
import { ImageLayerSchema } from "./imageLayerSchema";
import { RectangleLayerSchema } from "./rectangleLayerSchema";
import { TextLayerSchema } from "./textLayerSchema";
import { TriangleLayerSchema } from "./triangleLayerSchema";

export const AtomicLayerSchema = z.discriminatedUnion("type", [
  TextLayerSchema,
  RectangleLayerSchema,
  CircleLayerSchema,
  TriangleLayerSchema,
  ArrowLayerSchema,
  ImageLayerSchema,
]);

export type AtomicLayer = z.infer<typeof AtomicLayerSchema>;