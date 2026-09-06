import type { WipeDirection } from "../domain/layerAnimationSchema";

interface Point {
  x: number;
  y: number;
}

const SQUARE: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function revealDistance(point: Point, direction: WipeDirection): number {
  switch (direction) {
    case "left-to-right":
      return point.x;
    case "right-to-left":
      return 1 - point.x;
    case "top-to-bottom":
      return point.y;
    case "bottom-to-top":
      return 1 - point.y;
    case "top-left-to-bottom-right":
      return point.x + point.y;
    case "top-right-to-bottom-left":
      return 1 - point.x + point.y;
    case "bottom-left-to-top-right":
      return point.x + 1 - point.y;
    case "bottom-right-to-top-left":
      return 2 - point.x - point.y;
  }
}

function maximumDistance(direction: WipeDirection): number {
  return direction === "left-to-right" ||
    direction === "right-to-left" ||
    direction === "top-to-bottom" ||
    direction === "bottom-to-top"
    ? 1
    : 2;
}

function intersection(
  first: Point,
  second: Point,
  firstDistance: number,
  secondDistance: number,
  threshold: number,
): Point {
  const range = secondDistance - firstDistance;
  const amount = range === 0 ? 0 : (threshold - firstDistance) / range;
  return {
    x: first.x + (second.x - first.x) * amount,
    y: first.y + (second.y - first.y) * amount,
  };
}

function percentage(value: number): string {
  return `${Math.round(value * 10000) / 100}%`;
}

export function getWipeClipPath(
  direction: WipeDirection,
  progress: number,
): string | undefined {
  if (progress >= 1) return undefined;
  const threshold = Math.max(0, progress) * maximumDistance(direction);
  const points: Point[] = [];
  let previous = SQUARE[SQUARE.length - 1];
  let previousDistance = revealDistance(previous, direction);
  let previousInside = previousDistance <= threshold;
  const appendPoint = (point: Point): void => {
    const last = points[points.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
  };

  for (const current of SQUARE) {
    const currentDistance = revealDistance(current, direction);
    const currentInside = currentDistance <= threshold;
    if (currentInside !== previousInside) {
      appendPoint(
        intersection(
          previous,
          current,
          previousDistance,
          currentDistance,
          threshold,
        ),
      );
    }
    if (currentInside) appendPoint(current);
    previous = current;
    previousDistance = currentDistance;
    previousInside = currentInside;
  }

  while (points.length < 3) points.push(points[points.length - 1] ?? { x: 0, y: 0 });
  return `polygon(${points.map((point) => `${percentage(point.x)} ${percentage(point.y)}`).join(", ")})`;
}
