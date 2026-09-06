import { AbsoluteFill, Audio, Sequence } from "remotion";
import { resolveAssetUrl } from "../assetUrl";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { SceneComposition } from "./SceneComposition";

export interface ProjectCompositionProps {
  project: Project;
  scenes: Scene[];
  assetBaseUrl: string;
  includeAudio?: boolean;
  previewBackdrop?: boolean;
}

export function ProjectComposition({
  project,
  scenes,
  assetBaseUrl,
  includeAudio = true,
  previewBackdrop = false,
}: ProjectCompositionProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        overflow: "hidden"
      }}
    >
      {includeAudio && project.audioFile ? (
        <Audio
          src={resolveAssetUrl(assetBaseUrl, project.audioFile)}
          pauseWhenBuffering
        />
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
            assetBaseUrl={assetBaseUrl}
            previewBackdrop={previewBackdrop}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
