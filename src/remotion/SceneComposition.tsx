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
        backgroundColor: scene.backgroundColor ?? "transparent",
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
        const style: CSSProperties = {
          ...getLayerBaseStyle(layer),
          opacity: layer.opacity * animationStyle.opacityMultiplier,
          transform,
        };

        if (layer.type === "rectangle") {
          const cornerRadius = Math.min(
            layer.cornerRadius,
            Math.min(layer.width, layer.height) / 2,
          );

          return (
            <div key={layer.id} style={style}>
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

        if (layer.type === "circle") {
          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <circle
                  cx={layer.width / 2}
                  cy={layer.height / 2}
                  r={Math.min(layer.width, layer.height) / 2}
                  fill={layer.fill}
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth}
                />
              </svg>
            </div>
          );
        }

        if (layer.type === "triangle") {
          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <polygon
                  points={`${layer.width / 2},0 ${layer.width},${layer.height} 0,${layer.height}`}
                  fill={layer.fill}
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth}
                />
              </svg>
            </div>
          );
        }

        if (layer.type === "line") {
          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <g transform={`translate(${layer.width / 2} ${layer.height / 2})`}>
                  <line
                    x1={-layer.width / 2}
                    y1={0}
                    x2={layer.width / 2}
                    y2={0}
                    stroke={layer.stroke}
                    strokeWidth={layer.strokeWidth}
                    strokeLinecap="butt"
                  />
                </g>
              </svg>
            </div>
          );
        }

        if (layer.type === "arrow") {
          const arrowHeadSize = Math.max(
            0,
            Math.min(layer.arrowHeadSize, layer.width, layer.height),
          );
          const shaftWidth = Math.max(0, layer.width - arrowHeadSize);

          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <g transform={`translate(${layer.width / 2} ${layer.height / 2})`}>
                  {shaftWidth > 0 ? (
                    <rect
                      x={-layer.width / 2}
                      y={-layer.strokeWidth / 2}
                      width={shaftWidth}
                      height={layer.strokeWidth}
                      fill={layer.stroke}
                    />
                  ) : null}
                  {arrowHeadSize > 0 ? (
                    <polygon
                      points={`${layer.width / 2 - arrowHeadSize},${-layer.height / 2} ${layer.width / 2},0 ${layer.width / 2 - arrowHeadSize},${layer.height / 2}`}
                      fill={layer.stroke}
                    />
                  ) : null}
                </g>
              </svg>
            </div>
          );
        }

        return (
          <div
            key={layer.id}
            style={{
              ...style,
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
