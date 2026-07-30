import { z } from "zod";

export const SceneReferenceSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
});

export type SceneReference = z.infer<typeof SceneReferenceSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  scenes: z.array(SceneReferenceSchema),
});

export type Project = z.infer<typeof ProjectSchema>;

export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}
