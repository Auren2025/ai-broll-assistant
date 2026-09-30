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
 * Fade-out fades the whole scene (all layers together) TO TRANSPARENT, not
 * to black: the pipeline exports with an alpha channel for further editing
 * in DaVinci Resolve, where backgrounds are added uniformly in post. So the
 * scene's own opacity is animated; the editor preview shows a transparency
 * checkerboard behind the player so the fade reads as alpha, not white.
 */
export function SceneExitTransition({ scene, children }: SceneExitTransitionProps) {
  const frame = useCurrentFrame();
  const transition = scene.exitTransition;
  if (!transition) return <>{children}</>;

  switch (transition.type) {
    case "fade-out": {
      const opacity = getExitTransitionOpacity(
        frame,
        scene.durationInFrames,
        transition.durationInFrames,
      );
      return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
    }
  }
}
