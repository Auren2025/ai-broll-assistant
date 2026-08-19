import { useEffect, type RefObject } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import type { Scene } from "../domain/sceneSchema";
import { SceneComposition } from "./SceneComposition";

interface RemotionScenePlayerProps {
  scene: Scene;
  projectId: string;
  projectWidth: number;
  projectHeight: number;
  fps: number;
  displayScale?: number;
  playerRef?: RefObject<PlayerRef | null>;
  onFrameChange?: (frame: number) => void;
}

export function RemotionScenePlayer({
  scene,
  projectId,
  projectWidth,
  projectHeight,
  fps,
  displayScale = 0.5,
  playerRef,
  onFrameChange,
}: RemotionScenePlayerProps) {
  useEffect(() => {
    const player = playerRef?.current;
    if (!player || !onFrameChange) {
      return;
    }

    const handleFrameUpdate = (event: { detail: { frame: number } }): void => {
      onFrameChange(event.detail.frame);
    };

    onFrameChange(player.getCurrentFrame());
    player.addEventListener("frameupdate", handleFrameUpdate);
    return () => player.removeEventListener("frameupdate", handleFrameUpdate);
  }, [onFrameChange, playerRef]);

  return (
    <Player
      ref={playerRef}
      component={SceneComposition}
      inputProps={{ scene, projectId, previewBackdrop: true }}
      durationInFrames={scene.durationInFrames}
      compositionWidth={projectWidth}
      compositionHeight={projectHeight}
      fps={fps}
      controls
      style={{
        width: projectWidth * displayScale,
        height: projectHeight * displayScale,
      }}
    />
  );
}
