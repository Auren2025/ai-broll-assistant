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
  /** Alignment guides currently being held by the active drag. */
  heldVertical: number | null;
  heldHorizontal: number | null;
  /** Two-neighbor spacing pair currently being held (the two facing edges). */
  heldSpacingX: { from: number; to: number } | null;
  heldSpacingY: { from: number; to: number } | null;
  /** Scene-wide gap match currently being held. */
  heldGapX: { value: number; side: "left" | "right" | "top" | "bottom" } | null;
  heldGapY: { value: number; side: "left" | "right" | "top" | "bottom" } | null;
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

/**
 * Scene-wide gap match: the dragged object's edge gap (to its nearest
 * non-dragged neighbor on `side`) matches a gap value that already exists
 * between some other pair of objects in the scene. Rendered with a `= N` label.
 */
export interface GapMatch {
  axis: "x" | "y";
  side: "left" | "right" | "top" | "bottom";
  /** The reference gap value the dragged gap matched. */
  value: number;
  /** Perpendicular coordinate used to position the rendered guide. */
  anchor: number;
  /** Edge segment (scene coords) where the dragged object sits. */
  from: number;
  to: number;
}

export interface AxisSnap {
  delta: number;
  /** Alignment guide coordinate when the alignment snap engaged on this axis, else null. */
  alignGuide: number | null;
  /** Equal-spacing info when spacing snap engaged on this axis, else null. */
  spacing: Omit<SpacingInfo, "axis"> | null;
  /** Scene-wide gap match when snapGap engaged on this axis, else null. */
  gap: Omit<GapMatch, "axis"> | null;
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
  ambiguityRatio = 0.5,
): { delta: number; guide: number } | null {
  // Keep the held guide while the object stays within threshold + hysteresis.
  if (held !== null) {
    const delta = closestEdgeDelta(edges, held);
    if (Math.abs(delta) <= threshold + hysteresis) {
      return { delta, guide: held };
    }
  }

  // Otherwise snap to the closest candidate within the (smaller) threshold,
  // but only when it is meaningfully closer than the runner-up. Without
  // this, jitter appears when two candidates sit equidistantly inside the
  // snap range — the closest flips each frame as the dragged moves by
  // sub-pixel amounts.
  let best: { delta: number; guide: number } | null = null;
  let second: number = Number.POSITIVE_INFINITY;
  for (const value of candidates) {
    const distance = Math.abs(closestEdgeDelta(edges, value));
    if (distance > threshold) continue;
    if (!best || distance < Math.abs(best.delta)) {
      second = best ? Math.abs(best.delta) : Number.POSITIVE_INFINITY;
      best = { delta: closestEdgeDelta(edges, value), guide: value };
    } else if (distance < second) {
      second = distance;
    }
  }
  if (best && second !== Number.POSITIVE_INFINITY) {
    const bestDistance = Math.abs(best.delta);
    if (second - bestDistance < threshold * ambiguityRatio) {
      // Ambiguous — the closest and runner-up are too close together. Skip
      // the snap rather than oscillating between two candidates.
      return null;
    }
  }
  return best;
}

/**
 * Equal-spacing for a dragged object between its two immediate neighbors on
 * an axis: position it so the edge gaps on both sides are equal. With
 * `heldSpacing` set, the same neighbor pair stays locked until the dragged
 * object drifts beyond threshold + hysteresis.
 */
function resolveSpacingAxis(
  draggedStart: number,
  draggedEnd: number,
  others: readonly AxisBounds[],
  threshold: number,
  hysteresis: number,
  held: { from: number; to: number } | null,
): { delta: number; from: number; to: number; gap: number } | null {
  const width = draggedEnd - draggedStart;

  if (held) {
    const leftNeighbor = others.find((b) => Math.abs(b.end - held.from) < 1e-6);
    const rightNeighbor = others.find((b) => Math.abs(b.start - held.to) < 1e-6);
    if (leftNeighbor && rightNeighbor) {
      const targetStart = (leftNeighbor.end + rightNeighbor.start - width) / 2;
      const delta = targetStart - draggedStart;
      if (Math.abs(delta) <= threshold + hysteresis) {
        return {
          delta,
          from: leftNeighbor.end,
          to: rightNeighbor.start,
          gap: (rightNeighbor.start - leftNeighbor.end - width) / 2,
        };
      }
    }
  }

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

/**
 * Build the set of reference gap values for snapGap: edge-to-edge distances
 * between consecutive non-overlapping pairs of bounds on this axis (sorted
 * by start). Only adjacent gaps in the layout are considered, which matches
 * the Figma/Keynote mental model — a layout gap, not an arbitrary sum.
 */
export function buildReferenceGaps(bounds: readonly AxisBounds[]): number[] {
  const sorted = [...bounds].sort((a, b) => a.start - b.start);
  const values = new Set<number>();
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = b.start - a.end;
    if (gap > 0) values.add(gap);
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * Find the nearest non-dragged neighbor on each side of the dragged object.
 */
function nearestNeighbors(
  draggedStart: number,
  draggedEnd: number,
  others: readonly AxisBounds[],
): { left: AxisBounds | null; right: AxisBounds | null } {
  let left: AxisBounds | null = null;
  let right: AxisBounds | null = null;
  for (const b of others) {
    if (b.end <= draggedStart) {
      if (!left || b.end > left.end) left = b;
    } else if (b.start >= draggedEnd) {
      if (!right || b.start < right.start) right = b;
    }
  }
  return { left, right };
}

/**
 * Scene-wide gap match (snapGap). The dragged object's edge gap to its
 * nearest neighbor on a side matches a gap value that exists between another
 * pair of objects in the scene. Snaps the dragged object so the gap becomes
 * exactly that reference value, and returns the matched value for rendering
 * the `= N` indicator.
 */
function resolveGapAxis(
  draggedStart: number,
  draggedEnd: number,
  others: readonly AxisBounds[],
  referenceGaps: readonly number[],
  threshold: number,
  hysteresis: number,
  held: { value: number; side: "left" | "right" | "top" | "bottom" } | null,
  sideAxis: "left" | "right" | "top" | "bottom",
): { delta: number; value: number; side: typeof sideAxis; from: number; to: number } | null {
  const { left, right } = nearestNeighbors(draggedStart, draggedEnd, others);

  let best: { delta: number; value: number; side: typeof sideAxis; from: number; to: number } | null = null;

  const consider = (
    side: typeof sideAxis,
    neighbor: AxisBounds | null,
    currentGap: number,
  ): void => {
    if (!neighbor || referenceGaps.length === 0) return;

    // First: keep the held value while it stays within threshold + hysteresis.
    if (held && held.side === side) {
      const snapDelta = held.value - currentGap;
      if (Math.abs(snapDelta) <= threshold + hysteresis) {
        const delta = side === "left" || side === "top" ? snapDelta : -snapDelta;
        const from = side === "left" || side === "top" ? draggedStart : neighbor.start;
        const to = side === "left" || side === "top" ? neighbor.end : draggedEnd;
        best = { delta, value: held.value, side, from, to };
        return;
      }
    }

    // Otherwise: find the closest reference gap value within the threshold.
    for (const ref of referenceGaps) {
      const snapDelta = ref - currentGap;
      if (Math.abs(snapDelta) > threshold) continue;
      const delta = side === "left" || side === "top" ? snapDelta : -snapDelta;
      const from = side === "left" || side === "top" ? draggedStart : neighbor.start;
      const to = side === "left" || side === "top" ? neighbor.end : draggedEnd;
      if (!best || Math.abs(snapDelta) < Math.abs(
        side === "left" || side === "top"
          ? best.delta
          : -best.delta,
      )) {
        best = { delta, value: ref, side, from, to };
      }
    }
  };

  if (left) {
    const currentGap = draggedStart - left.end;
    consider(sideAxis === "top" || sideAxis === "bottom" ? "top" : "left", left, currentGap);
  }
  if (right) {
    const currentGap = right.start - draggedEnd;
    consider(sideAxis === "top" || sideAxis === "bottom" ? "bottom" : "right", right, currentGap);
  }

  return best;
}

function pickAxis(
  align: { delta: number; guide: number } | null,
  spacing: { delta: number; from: number; to: number; gap: number } | null,
  gap: { delta: number; value: number; side: "left" | "right" | "top" | "bottom"; from: number; to: number } | null,
  anchor: number,
): AxisSnap {
  const alignDistance = align ? Math.abs(align.delta) : Number.POSITIVE_INFINITY;
  const spacingDistance = spacing
    ? Math.abs(spacing.delta)
    : Number.POSITIVE_INFINITY;
  const gapDistance = gap ? Math.abs(gap.delta) : Number.POSITIVE_INFINITY;

  // Priority: alignment > spacing > gap (alignment is the most precise intent,
  // spacing ties between two neighbors, gap is the loosest scene-wide match).
  if (align && alignDistance <= spacingDistance && alignDistance <= gapDistance) {
    return {
      delta: align.delta,
      alignGuide: align.guide,
      spacing: null,
      gap: null,
    };
  }

  if (spacing && spacingDistance <= gapDistance) {
    return {
      delta: spacing.delta,
      alignGuide: null,
      spacing: { from: spacing.from, to: spacing.to, gap: spacing.gap, anchor },
      gap: null,
    };
  }

  if (gap) {
    return {
      delta: gap.delta,
      alignGuide: null,
      spacing: null,
      gap: {
        side: gap.side,
        value: gap.value,
        anchor,
        from: gap.from,
        to: gap.to,
      },
    };
  }

  return { delta: 0, alignGuide: null, spacing: null, gap: null };
}

/**
 * Computes alignment (edges/centers + canvas), two-neighbor equal-spacing, and
 * scene-wide gap-match snaps for a dragged bounding box. Per axis, whichever
 * snap is closer wins; alignment > spacing > gap. The held guides make
 * snapping stable (no jitter) by keeping the current target until the pointer
 * moves beyond threshold + hysteresis.
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
    options.hysteresis,
    options.heldSpacingX,
  );
  const referenceGapsX = buildReferenceGaps(othersX);
  const gapX = resolveGapAxis(
    dragged.left,
    dragged.left + dragged.width,
    othersX,
    referenceGapsX,
    options.threshold,
    options.hysteresis,
    options.heldGapX,
    "left",
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
    options.hysteresis,
    options.heldSpacingY,
  );
  const referenceGapsY = buildReferenceGaps(othersY);
  const gapY = resolveGapAxis(
    dragged.top,
    dragged.top + dragged.height,
    othersY,
    referenceGapsY,
    options.threshold,
    options.hysteresis,
    options.heldGapY,
    "top",
  );

  return {
    x: pickAxis(alignX, spacingX, gapX, dragged.top + dragged.height / 2),
    y: pickAxis(alignY, spacingY, gapY, dragged.left + dragged.width / 2),
  };
}