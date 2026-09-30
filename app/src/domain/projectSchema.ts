import { z } from "zod";

const SCENE_FILE_PATTERN = /^scenes\/[A-Za-z0-9_-]+\.json$/;

export const SceneReferenceSchema = z
  .object({
    id: z.string().min(1),
    startFrame: z.number().int().nonnegative().optional(),
    file: z
      .string()
      .regex(SCENE_FILE_PATTERN, "Scene file must match scenes/<name>.json"),
  })
  .strict();

export type SceneReference = z.infer<typeof SceneReferenceSchema>;

const projectFields = {
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  audioFile: z
    .string()
    .regex(
      /^(?:audio\/)?[A-Za-z0-9_.-]+$/,
      "Audio file must be a project-root filename or legacy audio/<name>",
    )
    .nullable()
    .optional(),
  scenes: z.array(SceneReferenceSchema).min(1, "Project must contain at least one scene"),
};

export const ProjectSchema = z
  .discriminatedUnion("schemaVersion", [
    z.object({ schemaVersion: z.literal(1), kind: z.enum(["broll", "slide"]).default("broll"), ...projectFields }).strict(),
    z.object({ schemaVersion: z.literal(2), kind: z.enum(["broll", "slide"]), ...projectFields }).strict(),
  ])
  .superRefine((project, context) => {
    const sceneIds = new Set<string>();
    const sceneFiles = new Set<string>();

    project.scenes.forEach((scene, index) => {
      if (project.schemaVersion === 2) {
        if (project.kind === "broll" && scene.startFrame === undefined) {
          context.addIssue({ code: "custom", message: "B-roll scene requires a timeline startFrame", path: ["scenes", index, "startFrame"] });
        }
        if (project.kind === "slide" && scene.startFrame !== undefined) {
          context.addIssue({ code: "custom", message: "Slide page cannot have a timeline startFrame", path: ["scenes", index, "startFrame"] });
        }
      }
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
