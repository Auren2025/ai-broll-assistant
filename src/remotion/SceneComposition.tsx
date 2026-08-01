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

function roundedRectanglePath(
  width: number,
  height: number,
  radii: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number },
  inset = 0,
): string {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const maximum = Math.max(0, Math.min(right - left, bottom - top) / 2);
  const tl = Math.min(radii.topLeft, maximum);
  const tr = Math.min(radii.topRight, maximum);
  const br = Math.min(radii.bottomRight, maximum);
  const bl = Math.min(radii.bottomLeft, maximum);

  return `M ${left + tl} ${top} H ${right - tr} Q ${right} ${top} ${right} ${top + tr} V ${bottom - br} Q ${right} ${bottom} ${right - br} ${bottom} H ${left + bl} Q ${left} ${bottom} ${left} ${bottom - bl} V ${top + tl} Q ${left} ${top} ${left + tl} ${top} Z`;
}

function roundedTrianglePath(
  width: number,
  height: number,
  radius: number,
): string {
  const points = [
    { x: width / 2, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y);
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y);
    const previousUnit = {
      x: (previous.x - point.x) / previousLength,
      y: (previous.y - point.y) / previousLength,
    };
    const nextUnit = {
      x: (next.x - point.x) / nextLength,
      y: (next.y - point.y) / nextLength,
    };
    const angle = Math.acos(
      Math.min(
        1,
        Math.max(-1, previousUnit.x * nextUnit.x + previousUnit.y * nextUnit.y),
      ),
    );
    const tangentScale = Math.tan(angle / 2);
    const requestedDistance = tangentScale > 0 ? radius / tangentScale : 0;
    const distance = Math.min(
      requestedDistance,
      previousLength / 2,
      nextLength / 2,
    );
    return {
      point,
      radius: distance * tangentScale,
      entry: {
        x: point.x + previousUnit.x * distance,
        y: point.y + previousUnit.y * distance,
      },
      exit: {
        x: point.x + nextUnit.x * distance,
        y: point.y + nextUnit.y * distance,
      },
    };
  });

  return `${corners
    .map(
      (corner, index) =>
        `${index === 0 ? `M ${corner.entry.x} ${corner.entry.y}` : `L ${corner.entry.x} ${corner.entry.y}`} A ${corner.radius} ${corner.radius} 0 0 1 ${corner.exit.x} ${corner.exit.y}`,
    )
    .join(" ")} Z`;
}

function ellipseSectorPath(
  width: number,
  height: number,
  donut: number,
  sweep: number,
  startAngle: number,
  radiusOffset = 0,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(0.001, width / 2 + radiusOffset);
  const ry = Math.max(0.001, height / 2 + radiusOffset);
  const innerRx = Math.max(0, rx * donut);
  const innerRy = Math.max(0, ry * donut);
  const start = ((startAngle - 90) * Math.PI) / 180;
  const sweepDegrees = Math.min(360, Math.max(0.001, sweep));
  const end = start + (sweepDegrees * Math.PI) / 180;
  const point = (radiusX: number, radiusY: number, angle: number) =>
    `${cx + radiusX * Math.cos(angle)} ${cy + radiusY * Math.sin(angle)}`;

  if (sweepDegrees >= 359.999) {
    const outerStart = point(rx, ry, start);
    const outerMiddle = point(rx, ry, start + Math.PI);
    const outer = `M ${outerStart} A ${rx} ${ry} 0 1 1 ${outerMiddle} A ${rx} ${ry} 0 1 1 ${outerStart}`;
    if (innerRx <= 0 || innerRy <= 0) return `${outer} Z`;
    const innerStart = point(innerRx, innerRy, start);
    const innerMiddle = point(innerRx, innerRy, start + Math.PI);
    return `${outer} Z M ${innerStart} A ${innerRx} ${innerRy} 0 1 0 ${innerMiddle} A ${innerRx} ${innerRy} 0 1 0 ${innerStart} Z`;
  }

  const largeArc = sweepDegrees > 180 ? 1 : 0;
  const outerStart = point(rx, ry, start);
  const outerEnd = point(rx, ry, end);
  if (innerRx <= 0 || innerRy <= 0) {
    return `M ${cx} ${cy} L ${outerStart} A ${rx} ${ry} 0 ${largeArc} 1 ${outerEnd} Z`;
  }
  const innerEnd = point(innerRx, innerRy, end);
  const innerStart = point(innerRx, innerRy, start);
  return `M ${outerStart} A ${rx} ${ry} 0 ${largeArc} 1 ${outerEnd} L ${innerEnd} A ${innerRx} ${innerRy} 0 ${largeArc} 0 ${innerStart} Z`;
}

function ArrowHead({
  side,
  style,
  size,
  width,
  color,
  strokeWidth,
}: {
  side: "start" | "end";
  style: "triangle" | "line" | "diamond" | "circle";
  size: number;
  width: number;
  color: string;
  strokeWidth: number;
}) {
  const direction = side === "start" ? -1 : 1;
  const tipX = direction * (width / 2);
  const innerX = tipX - direction * size;
  const middleX = tipX - direction * (size / 2);
  const halfSize = size / 2;

  if (style === "line") {
    return (
      <polyline
        points={`${innerX},${-halfSize} ${tipX},0 ${innerX},${halfSize}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (style === "circle") {
    return <circle cx={middleX} cy={0} r={size / 2} fill={color} />;
  }

  const points =
    style === "diamond"
      ? `${tipX},0 ${middleX},${-halfSize} ${innerX},0 ${middleX},${halfSize}`
      : `${tipX},0 ${innerX},${-halfSize} ${innerX},${halfSize}`;
  return <polygon points={points} fill={color} />;
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
        isolation: "isolate",
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
          opacity:
            (layer.opacityEnabled ? layer.opacity : 1) *
            animationStyle.opacityMultiplier,
          mixBlendMode: layer.blendMode,
          transform,
        };

        if (layer.type === "rectangle") {
          const cornerRadii = layer.cornerEnabled
            ? (layer.cornerRadii ?? {
                topLeft: layer.cornerRadius,
                topRight: layer.cornerRadius,
                bottomRight: layer.cornerRadius,
                bottomLeft: layer.cornerRadius,
              })
            : { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
          const strokeInset = layer.strokeWidth / 2;

          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <path
                  d={roundedRectanglePath(layer.width, layer.height, cornerRadii)}
                  fill={layer.fillEnabled ? layer.fill : "none"}
                />
                <path
                  d={roundedRectanglePath(
                    layer.width,
                    layer.height,
                    cornerRadii,
                    strokeInset,
                  )}
                  fill="none"
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth}
                />
              </svg>
            </div>
          );
        }

        if (layer.type === "circle") {
          const strokeOffset = -layer.strokeWidth / 2;
          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <path
                  d={ellipseSectorPath(
                    layer.width,
                    layer.height,
                    layer.donut,
                    layer.sweep,
                    layer.startAngle,
                  )}
                  fill={layer.fillEnabled ? layer.fill : "none"}
                  fillRule="evenodd"
                />
                <path
                  d={ellipseSectorPath(
                    layer.width,
                    layer.height,
                    layer.donut,
                    layer.sweep,
                    layer.startAngle,
                    strokeOffset,
                  )}
                  fill="none"
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth}
                />
              </svg>
            </div>
          );
        }

        if (layer.type === "triangle") {
          const trianglePath = roundedTrianglePath(
            layer.width,
            layer.height,
            layer.cornerEnabled ? layer.cornerRadius : 0,
          );
          const clipId = `triangle-clip-${layer.id}`;
          return (
            <div key={layer.id} style={style}>
              <svg
                width={layer.width}
                height={layer.height}
                viewBox={`0 0 ${layer.width} ${layer.height}`}
                overflow="visible"
              >
                <defs>
                  <clipPath id={clipId}>
                    <path d={trianglePath} />
                  </clipPath>
                </defs>
                <path
                  d={trianglePath}
                  fill={layer.fillEnabled ? layer.fill : "none"}
                />
                <path
                  d={trianglePath}
                  fill="none"
                  stroke={layer.stroke ?? "none"}
                  strokeWidth={layer.strokeWidth * 2}
                  clipPath={`url(#${clipId})`}
                />
              </svg>
            </div>
          );
        }

        if (layer.type === "arrow") {
          const arrowHeadSize = Math.max(
            0,
            Math.min(layer.arrowHeadSize, layer.width / 2),
          );
          const startInset =
            layer.arrowStartStyle !== "none" ? arrowHeadSize : 0;
          const endInset = layer.arrowEndStyle !== "none" ? arrowHeadSize : 0;
          const shaftWidth = Math.max(
            0,
            layer.width - startInset - endInset,
          );

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
                      x={-layer.width / 2 + startInset}
                      y={-layer.strokeWidth / 2}
                      width={shaftWidth}
                      height={layer.strokeWidth}
                      fill={layer.stroke}
                    />
                  ) : null}
                  {arrowHeadSize > 0 && layer.arrowStartStyle !== "none" ? (
                    <ArrowHead side="start" style={layer.arrowStartStyle} size={arrowHeadSize} width={layer.width} color={layer.stroke} strokeWidth={layer.strokeWidth} />
                  ) : null}
                  {arrowHeadSize > 0 && layer.arrowEndStyle !== "none" ? (
                    <ArrowHead side="end" style={layer.arrowEndStyle} size={arrowHeadSize} width={layer.width} color={layer.stroke} strokeWidth={layer.strokeWidth} />
                  ) : null}
                </g>
              </svg>
            </div>
          );
        }

        const displayText =
          layer.textCase === "uppercase"
            ? layer.text.toUpperCase()
            : layer.textCase === "lowercase"
              ? layer.text.toLowerCase()
              : layer.text;

        return (
          <div
            key={layer.id}
            style={{
              ...style,
              display: "flex",
              flexDirection: "column",
              justifyContent:
                layer.verticalAlign === "top"
                  ? "flex-start"
                  : layer.verticalAlign === "bottom"
                    ? "flex-end"
                    : "center",
              color: layer.fillEnabled ? layer.fill : "transparent",
              fontFamily: layer.fontFamily,
              fontSize: layer.fontSize,
              fontWeight: layer.fontWeight,
              fontStyle: layer.fontStyle,
              lineHeight: layer.lineHeight,
              letterSpacing: `${layer.letterSpacing}px`,
              textAlign: layer.textAlign,
              fontKerning: layer.kerningPairs ? "normal" : "none",
              fontVariantLigatures: layer.ligatures ? "normal" : "none",
              WebkitTextStroke:
                layer.stroke && layer.strokeWidth > 0
                  ? `${layer.strokeWidth}px ${layer.stroke}`
                  : undefined,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {displayText}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
