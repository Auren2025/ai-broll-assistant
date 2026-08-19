import { z } from "zod";
import { ProjectSchema } from "../domain/projectSchema";
import { SceneSchema } from "../domain/sceneSchema";

export const PresentationDataSchema = z
  .object({
    project: ProjectSchema,
    scenes: z.array(SceneSchema),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.scenes.length !== data.project.scenes.length) {
      context.addIssue({
        code: "custom",
        message:
          "Presentation scenes must exactly match the project scene references",
        path: ["scenes"],
      });
      return;
    }

    data.project.scenes.forEach((reference, index) => {
      const scene = data.scenes[index];
      if (scene?.id !== reference.id) {
        context.addIssue({
          code: "custom",
          message:
            `Presentation scene at index ${index} must be "${reference.id}", ` +
            `got "${scene?.id ?? "missing"}"`,
          path: ["scenes", index, "id"],
        });
      }
    });
  });

export type PresentationData = z.infer<typeof PresentationDataSchema>;

export function parsePresentationData(input: unknown): PresentationData {
  return PresentationDataSchema.parse(input);
}
