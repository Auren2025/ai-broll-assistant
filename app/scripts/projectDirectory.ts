import { existsSync } from "node:fs";
import { join } from "node:path";

export type ProjectCategory = "broll" | "slide";

export function projectDirectory(
  root: string,
  projectId: string,
  category?: ProjectCategory,
): string {
  if (category) return join(root, category, projectId);

  const broll = join(root, "broll", projectId);
  const slide = join(root, "slide", projectId);
  if (existsSync(broll) && existsSync(slide)) {
    throw new Error(`Project id "${projectId}" exists in both broll and slide`);
  }
  return existsSync(slide) ? slide : broll;
}
