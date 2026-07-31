import { z } from "zod";
import { RectangleLayerSchema } from "./rectangleLayerSchema";
import { TextLayerSchema } from "./textLayerSchema";

// Scene timeline rules:
// - startFrame is the scene's starting frame on the full project timeline.
// - durationInFrames is the number of frames the scene lasts.
// - endFrame is derived from startFrame + durationInFrames and is not persisted.
// - Higher zIndex values render in front of lower values.
// - Layer ids and zIndex values must be unique within a scene.
//
// Animation time-window rule:
// - Every animation attached to any layer of this scene must satisfy
//   animation.startFrame + animation.durationInFrames <= scene.durationInFrames.
//   Animation frames are local to this scene (animation.startFrame 0 means
//   "at this scene's startFrame", not "at project frame 0").

export const LayerSchema = z.discriminatedUnion("type", [
  TextLayerSchema,
  RectangleLayerSchema,
]);

export type Layer = z.infer<typeof LayerSchema>;

export const SceneSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    topic: z.string().min(1),
    startFrame: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
    layers: z.array(LayerSchema),
  })
  .strict()
  .superRefine((scene, context) => {
    const layerIds = new Set<string>();
    const zIndexes = new Set<number>();

    scene.layers.forEach((layer, index) => {
      if (layerIds.has(layer.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate layer id: ${layer.id}`,
          path: ["layers", index, "id"],
        });
      } else {
        layerIds.add(layer.id);
      }

      if (zIndexes.has(layer.zIndex)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate layer zIndex: ${layer.zIndex}`,
          path: ["layers", index, "zIndex"],
        });
      } else {
        zIndexes.add(layer.zIndex);
      }

      layer.animations.forEach((animation, animationIndex) => {
        const endFrame = animation.startFrame + animation.durationInFrames;

        if (endFrame > scene.durationInFrames) {
          context.addIssue({
            code: "custom",
            message:
              `Layer "${layer.id}" animation "${animation.id}" ends at ` +
              `frame ${endFrame}, which is past the scene duration of ` +
              `${scene.durationInFrames}.`,
            path: [
              "layers",
              index,
              "animations",
              animationIndex,
              "durationInFrames",
            ],
          });
        }
      });
    });
  });

export type Scene = z.infer<typeof SceneSchema>;

export function parseScene(input: unknown): Scene {
  return SceneSchema.parse(input);
}