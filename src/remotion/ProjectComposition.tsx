import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { buildAssetUrl } from "../api/localService";
import { SceneComposition } from "./SceneComposition";

export interface ProjectCompositionProps {
  project: Project;
  scenes: Scene[];
  includeAudio?: boolean;
  previewBackdrop?: boolean;
}

export function ProjectComposition({
  project,
  scenes,
  includeAudio = true,
  previewBackdrop = false,
}: ProjectCompositionProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        overflow: "hidden",
        translate: "-2px 0px"
      }}
    >
      {includeAudio && project.audioFile ? (
        <Audio src={buildAssetUrl(project.id, project.audioFile)} />
      ) : null}
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          name={`${project.name} · ${scene.id}`}
        >
          <SceneComposition
            scene={scene}
            projectId={project.id}
            previewBackdrop={previewBackdrop}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
