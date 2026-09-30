import { z } from "zod";
import { AtomicLayerSchema } from "./atomicLayerSchema";
import { GroupLayerSchema } from "./groupLayerSchema";
import { isLineDrawDirectionValid, isLineDrawEligible } from "./lineDraw";

// Scene timeline rules:
// - Legacy startFrame is accepted for older scenes. B-roll placement belongs
//   to the project scene reference; slide pages have no absolute start.
// - durationInFrames is the number of frames the scene lasts.
// - B-roll end frame is derived from the project reference's startFrame plus
//   this scene's durationInFrames; it is not persisted.
// - Higher zIndex values render in front of lower values.
// - Layer ids and zIndex values must be unique within a scene.
//
// Animation time-window rule:
// - Every animation attached to any layer of this scene must satisfy
//   animation.startFrame + animation.durationInFrames <= scene.durationInFrames.
//   Animation frames are local to this scene (animation.startFrame 0 means
//   "at this scene's start", not "at project frame 0").

export const LayerSchema = z.union([AtomicLayerSchema, GroupLayerSchema]);

export type Layer = z.infer<typeof LayerSchema>;

// Scene exit-transition rules:
// - exitTransition is optional; absent means a hard cut to the next scene.
// - When present, the named outro effect plays over the last durationInFrames
//   frames of this scene. It never overlaps the next scene (no crossfades):
//   scene entrances are handled by layer animations, this control only
//   handles the exit. New effect types are added to
//   SceneExitTransitionTypeSchema; each may use its own duration.
export const SceneExitTransitionTypeSchema = z.enum(["fade-out"]);

export type SceneExitTransitionType = z.infer<typeof SceneExitTransitionTypeSchema>;

export const SceneExitTransitionSchema = z.object({
  type: SceneExitTransitionTypeSchema,
  durationInFrames: z.number().int().min(1),
});

export type SceneExitTransition = z.infer<typeof SceneExitTransitionSchema>;

// Legacy page transition, superseded by the unified scene exitTransition.
// Nothing reads it anymore (the inspector no longer exposes it); it is kept
// only so older project files still parse under SceneSchema's .strict().
export const SceneTransitionSchema = z
  .object({
    type: z.enum(["none", "fade", "slide"]),
  })
  .strict();

export type SceneTransition = z.infer<typeof SceneTransitionSchema>;

export const SceneSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    id: z.string().min(1),
    name: z.string().min(1),
    startFrame: z.number().int().nonnegative().optional(),
    durationInFrames: z.number().int().positive(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    exitTransition: SceneExitTransitionSchema.optional(),
    transition: SceneTransitionSchema.optional(),
    layers: z.array(LayerSchema),
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.schemaVersion === 2 && scene.startFrame !== undefined) {
      context.addIssue({ code: "custom", message: "Scene startFrame belongs to the project scene reference", path: ["startFrame"] });
    }
    const layerIds = new Set<string>();
    const zIndexes = new Set<number>();

    const validateLayer = (
      layer: Layer,
      path: (string | number)[],
      zIndexes: Set<number>,
    ): void => {
      if (layerIds.has(layer.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate layer id: ${layer.id}`,
          path: [...path, "id"],
        });
      } else {
        layerIds.add(layer.id);
      }

      if (zIndexes.has(layer.zIndex)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate layer zIndex: ${layer.zIndex}`,
          path: [...path, "zIndex"],
        });
      } else {
        zIndexes.add(layer.zIndex);
      }

      layer.animations.forEach((animation, animationIndex) => {
        const endFrame = animation.startFrame + animation.durationInFrames;

        if (animation.preset === "line-draw") {
          if (!isLineDrawEligible(layer)) {
            context.addIssue({
              code: "custom",
              message: `Layer "${layer.id}" requires an effective shape stroke for Line Draw.`,
              path: [...path, "animations", animationIndex, "preset"],
            });
          } else if (!isLineDrawDirectionValid(layer, animation.direction)) {
            context.addIssue({
              code: "custom",
              message: `Layer "${layer.id}" has an invalid Line Draw direction.`,
              path: [...path, "animations", animationIndex, "direction"],
            });
          }
        }

        if (endFrame > scene.durationInFrames) {
          context.addIssue({
            code: "custom",
            message:
              `Layer "${layer.id}" animation "${animation.id}" ends at ` +
              `frame ${endFrame}, which is past the scene duration of ` +
              `${scene.durationInFrames}.`,
            path: [...path, "animations", animationIndex, "durationInFrames"],
          });
        }
      });

      if (layer.type === "group") {
        const childZIndexes = new Set<number>();
        layer.children.forEach((child, childIndex) => {
          validateLayer(child, [...path, "children", childIndex], childZIndexes);
        });
      }
    };

    scene.layers.forEach((layer, index) => {
      validateLayer(layer, ["layers", index], zIndexes);
    });
  });

export type Scene = z.infer<typeof SceneSchema>;

export function parseScene(input: unknown): Scene {
  if (input !== null && typeof input === "object" && "topic" in input) {
    // Migrate scenes saved before the topic field was renamed to name.
    const { topic, ...rest } = input as Record<string, unknown>;
    return SceneSchema.parse(
      "name" in rest ? rest : { ...rest, name: topic },
    );
  }
  return SceneSchema.parse(input);
}
