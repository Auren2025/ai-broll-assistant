import { AbsoluteFill, Sequence } from "remotion";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { SceneComposition } from "./SceneComposition";

export interface ProjectCompositionProps {
  project: Project;
  scenes: Scene[];
}

export function ProjectComposition({
  project,
  scenes,
}: ProjectCompositionProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
    >
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={`${project.name} · ${scene.id}`}
        >
          <SceneComposition scene={scene} projectId={project.id} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
