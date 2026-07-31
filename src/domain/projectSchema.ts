import { z } from "zod";

const SCENE_FILE_PATTERN = /^scenes\/[A-Za-z0-9_-]+\.json$/;

export const SceneReferenceSchema = z
  .object({
    id: z.string().min(1),
    file: z
      .string()
      .regex(SCENE_FILE_PATTERN, "Scene file must match scenes/<name>.json"),
  })
  .strict();

export type SceneReference = z.infer<typeof SceneReferenceSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    scenes: z.array(SceneReferenceSchema),
  })
  .strict()
  .superRefine((project, context) => {
    const sceneIds = new Set<string>();
    const sceneFiles = new Set<string>();

    project.scenes.forEach((scene, index) => {
      if (sceneIds.has(scene.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scene id: ${scene.id}`,
          path: ["scenes", index, "id"],
        });
      } else {
        sceneIds.add(scene.id);
      }

      if (sceneFiles.has(scene.file)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate scene file: ${scene.file}`,
          path: ["scenes", index, "file"],
        });
      } else {
        sceneFiles.add(scene.file);
      }
    });
  });

export type Project = z.infer<typeof ProjectSchema>;

export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}
