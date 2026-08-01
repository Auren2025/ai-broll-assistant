import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Layer, Scene } from "../domain/sceneSchema";
import { getLayerAnimationStyle } from "./layerAnimationStyle";

export interface SceneCompositionProps {
  scene: Scene;
}

function getLayerBaseStyle(layer: Layer): CSSProperties {
  return {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    zIndex: layer.zIndex,
    transformOrigin: "center center",
    pointerEvents: "none",
  };
}

export function SceneComposition({ scene }: SceneCompositionProps) {
  const frame = useCurrentFrame();

  const sortedLayers = [...scene.layers].sort(
    (first, second) => first.zIndex - second.zIndex,
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
    >
      {sortedLayers.map((layer) => {
        if (!layer.visible) {
          return null;
        }

        const animationStyle = getLayerAnimationStyle(
          layer.animations,
          frame,
        );

        const transform = `translate(${animationStyle.translateX}px, ${animationStyle.translateY}px) rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY}) scale(${animationStyle.scale})`;

        if (layer.type === "rectangle") {
          const cornerRadius = Math.min(
            layer.cornerRadius,
            Math.min(layer.width, layer.height) / 2,
          );

          return (
            <div
              key={layer.id}
              style={{
                ...getLayerBaseStyle(layer),
                opacity: layer.opacity * animationStyle.opacityMultiplier,
                transform,
              }}
            >
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <rect
                  x={0}
                  y={0}
                  width={layer.width}
                  height={layer.height}
                  rx={cornerRadius}
                  ry={cornerRadius}
                  fill={layer.fill}
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth}
                />
              </svg>
            </div>
          );
        }

        return (
          <div
            key={layer.id}
            style={{
              ...getLayerBaseStyle(layer),
              opacity: layer.opacity * animationStyle.opacityMultiplier,
              transform,
              color: layer.fill,
              fontFamily: layer.fontFamily,
              fontSize: layer.fontSize,
              fontWeight: layer.fontWeight,
              fontStyle: layer.fontStyle,
              lineHeight: layer.lineHeight,
              letterSpacing: `${layer.letterSpacing}px`,
              textAlign: layer.textAlign,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {layer.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
