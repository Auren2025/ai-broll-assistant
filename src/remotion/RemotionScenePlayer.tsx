import { Player } from "@remotion/player";
import type { Scene } from "../domain/sceneSchema";
import { SceneComposition } from "./SceneComposition";

interface RemotionScenePlayerProps {
  scene: Scene;
  projectWidth: number;
  projectHeight: number;
  fps: number;
  displayScale?: number;
}

export function RemotionScenePlayer({
  scene,
  projectWidth,
  projectHeight,
  fps,
  displayScale = 0.5,
}: RemotionScenePlayerProps) {
  return (
    <Player
      component={SceneComposition}
      inputProps={{ scene }}
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
