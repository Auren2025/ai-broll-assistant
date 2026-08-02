export interface SnapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SnapOptions {
  /** Snap engages within this distance (scene units). */
  threshold: number;
  /** Once a guide is held, it stays held until the object moves beyond threshold + hysteresis. */
  hysteresis: number;
  /** Guides currently being held by the active drag. */
  heldVertical: number | null;
  heldHorizontal: number | null;
}

export interface SpacingInfo {
  axis: "x" | "y";
  /** Segment start/end on the distributed axis (neighbor facing edges). */
  from: number;
  to: number;
  /** The equal gap value in scene units. */
  gap: number;
  /** Perpendicular coordinate used to position the rendered segment. */
  anchor: number;
}

export interface AxisSnap {
  delta: number;
  /** Guide coordinate when the alignment snap engaged on this axis, else null. */
  alignGuide: number | null;
  /** Equal-spacing info when spacing snap engaged on this axis, else null. */
  spacing: Omit<SpacingInfo, "axis"> | null;
}

export interface SnapResult {
  x: AxisSnap;
  y: AxisSnap;
}

interface AxisBounds {
  start: number;
  end: number;
}

function closestEdgeDelta(edges: readonly number[], value: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const edge of edges) {
    const delta = value - edge;
    if (Math.abs(delta) < Math.abs(best)) {
      best = delta;
    }
  }
  return best;
}

function resolveAlignmentAxis(
  edges: readonly number[],
  candidates: readonly number[],
  threshold: number,
  hysteresis: number,
  held: number | null,
): { delta: number; guide: number } | null {
  // Keep the held guide while the object stays within threshold + hysteresis.
  if (held !== null) {
    const delta = closestEdgeDelta(edges, held);
    if (Math.abs(delta) <= threshold + hysteresis) {
      return { delta, guide: held };
    }
  }

  // Otherwise snap to the closest candidate within the (smaller) threshold.
  let best: { delta: number; guide: number } | null = null;
  for (const value of candidates) {
    const delta = closestEdgeDelta(edges, value);
    if (
      Math.abs(delta) <= threshold &&
      (!best || Math.abs(delta) < Math.abs(best.delta))
    ) {
      best = { delta, guide: value };
    }
  }
  return best;
}

/**
 * Equal-spacing for a dragged object between its two immediate neighbors on an
 * axis: position it so the edge gaps on both sides are equal.
 */
function resolveSpacingAxis(
  draggedStart: number,
  draggedEnd: number,
  others: readonly AxisBounds[],
  threshold: number,
): { delta: number; from: number; to: number; gap: number } | null {
  const sorted = [...others].sort(
    (a, b) => (a.start + a.end) / 2 - (b.start + b.end) / 2,
  );
  const draggedCenter = (draggedStart + draggedEnd) / 2;

  let left: AxisBounds | null = null;
  let right: AxisBounds | null = null;
  for (const bounds of sorted) {
    const center = (bounds.start + bounds.end) / 2;
    if (center < draggedCenter) {
      left = bounds;
    } else if (center > draggedCenter) {
      right = bounds;
      break;
    }
  }
  if (!left || !right) {
    return null;
  }

  const width = draggedEnd - draggedStart;
  const targetStart = (left.end + right.start - width) / 2;
  const delta = targetStart - draggedStart;
  if (Math.abs(delta) > threshold) {
    return null;
  }

  return {
    delta,
    from: left.end,
    to: right.start,
    gap: (right.start - left.end - width) / 2,
  };
}

function pickAxis(
  align: { delta: number; guide: number } | null,
  spacing: { delta: number; from: number; to: number; gap: number } | null,
  anchor: number,
): AxisSnap {
  const alignDistance = align ? Math.abs(align.delta) : Number.POSITIVE_INFINITY;
  const spacingDistance = spacing
    ? Math.abs(spacing.delta)
    : Number.POSITIVE_INFINITY;

  if (spacing && spacingDistance < alignDistance) {
    return {
      delta: spacing.delta,
      alignGuide: null,
      spacing: { from: spacing.from, to: spacing.to, gap: spacing.gap, anchor },
    };
  }

  if (align) {
    return { delta: align.delta, alignGuide: align.guide, spacing: null };
  }

  return { delta: 0, alignGuide: null, spacing: null };
}

/**
 * Computes alignment (edges/centers + canvas) and equal-spacing snaps for a
 * dragged bounding box. Per axis, whichever snap is closer wins; alignment wins
 * ties. The held guides make snapping stable (no jitter) by keeping the current
 * target until the pointer moves beyond threshold + hysteresis.
 */
export function computeSnapGuides(
  dragged: SnapRect,
  candidateX: readonly number[],
  candidateY: readonly number[],
  othersX: readonly { start: number; end: number }[],
  othersY: readonly { start: number; end: number }[],
  options: SnapOptions,
): SnapResult {
  const edgesX = [
    dragged.left,
    dragged.left + dragged.width / 2,
    dragged.left + dragged.width,
  ];
  const edgesY = [
    dragged.top,
    dragged.top + dragged.height / 2,
    dragged.top + dragged.height,
  ];

  const alignX = resolveAlignmentAxis(
    edgesX,
    candidateX,
    options.threshold,
    options.hysteresis,
    options.heldVertical,
  );
  const spacingX = resolveSpacingAxis(
    dragged.left,
    dragged.left + dragged.width,
    othersX,
    options.threshold,
  );
  const alignY = resolveAlignmentAxis(
    edgesY,
    candidateY,
    options.threshold,
    options.hysteresis,
    options.heldHorizontal,
  );
  const spacingY = resolveSpacingAxis(
    dragged.top,
    dragged.top + dragged.height,
    othersY,
    options.threshold,
  );

  return {
    x: pickAxis(alignX, spacingX, dragged.top + dragged.height / 2),
    y: pickAxis(alignY, spacingY, dragged.left + dragged.width / 2),
  };
}
