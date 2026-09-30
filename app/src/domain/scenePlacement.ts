import type { Project } from "./projectSchema";
import type { Scene } from "./sceneSchema";

export function sceneStartFrame(project: Project, scene: Scene): number {
  if (project.kind === "slide") return 0;
  const reference = project.scenes.find((item) => item.id === scene.id);
  if (!reference) throw new Error(`Scene "${scene.id}" is not in the project`);
  if (reference.startFrame !== undefined) return reference.startFrame;
  if (scene.startFrame !== undefined) return scene.startFrame;
  throw new Error(`B-roll scene "${scene.id}" has no timeline anchor`);
}
