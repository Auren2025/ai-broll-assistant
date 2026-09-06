import type { RefObject } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Audio, Sequence } from "remotion";
import { resolveAssetUrl } from "../assetUrl";
import { buildProjectAssetBaseUrl } from "../api/localService";
import type { Scene } from "../domain/sceneSchema";
import { SceneComposition } from "./SceneComposition";

interface RemotionScenePlayerProps {
  scene: Scene;
  projectId: string;
  audioFile?: string | null;
  projectWidth: number;
  projectHeight: number;
  fps: number;
  displayScale?: number;
  playerRef?: RefObject<PlayerRef | null>;
}

interface ScenePreviewCompositionProps {
  scene: Scene;
  assetBaseUrl: string;
  audioFile?: string | null;
}

function ScenePreviewComposition({
  scene,
  assetBaseUrl,
  audioFile,
}: ScenePreviewCompositionProps) {
  return (
    <>
      {audioFile ? (
        <Audio
          src={resolveAssetUrl(assetBaseUrl, audioFile)}
          pauseWhenBuffering
        />
      ) : null}
      <Sequence
        from={scene.startFrame}
        durationInFrames={scene.durationInFrames}
      >
        <SceneComposition
          scene={scene}
          assetBaseUrl={assetBaseUrl}
          previewBackdrop
        />
      </Sequence>
    </>
  );
}

export function RemotionScenePlayer({
  scene,
  projectId,
  audioFile,
  projectWidth,
  projectHeight,
  fps,
  displayScale = 0.5,
  playerRef,
}: RemotionScenePlayerProps) {
  const sceneEndFrame = scene.startFrame + scene.durationInFrames;
  const assetBaseUrl = buildProjectAssetBaseUrl(projectId);

  return (
    <Player
      ref={playerRef}
      component={ScenePreviewComposition}
      inputProps={{ scene, assetBaseUrl, audioFile }}
      durationInFrames={sceneEndFrame}
      compositionWidth={projectWidth}
      compositionHeight={projectHeight}
      fps={fps}
      initialFrame={scene.startFrame}
      inFrame={scene.startFrame}
      outFrame={sceneEndFrame - 1}
      numberOfSharedAudioTags={0}
      controls
      style={{
        width: projectWidth * displayScale,
        height: projectHeight * displayScale,
      }}
    />
  );
}
