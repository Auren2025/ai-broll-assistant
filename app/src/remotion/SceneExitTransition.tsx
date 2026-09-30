import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Scene } from "../domain/sceneSchema";
import { getExitTransitionOpacity } from "./exitTransitionOpacity";

interface SceneExitTransitionProps {
  scene: Scene;
  children: ReactNode;
}

/**
 * Applies the scene's exit transition (outro) around its content. Must be
 * rendered inside the scene's <Sequence> so useCurrentFrame() is local to
 * the scene. When the scene has no exitTransition, children render unchanged
 * (hard cut). New transition types are added to the switch below; each type
 * owns its own duration and never overlaps the next scene.
 *
 * Fade-out fades TO BLACK via an overlay: fading the scene's own opacity
 * would reveal whatever sits behind the player (white canvas in the editor,
 * black in an MP4 export), which looks inconsistent.
 */
export function SceneExitTransition({ scene, children }: SceneExitTransitionProps) {
  const frame = useCurrentFrame();
  const transition = scene.exitTransition;
  if (!transition) return <>{children}</>;

  switch (transition.type) {
    case "fade-out": {
      const overlayOpacity =
        1 -
        getExitTransitionOpacity(
          frame,
          scene.durationInFrames,
          transition.durationInFrames,
        );
      if (overlayOpacity <= 0) return <>{children}</>;
      return (
        <>
          {children}
          <AbsoluteFill
            style={{
              backgroundColor: "#000000",
              opacity: overlayOpacity,
              pointerEvents: "none",
            }}
          />
        </>
      );
    }
  }
}
