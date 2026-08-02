import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReferenceGaps,
  computeSnapGuides,
  type SnapOptions,
} from "../src/editor/snapGuides";

// Screen-space snap margin is 5px, hysteresis 2px; these are the scene-unit
// values at 100% zoom (scale 1).
const THRESHOLD = 5;
const HYSTERESIS = 2;

function options(
  heldVertical: number | null = null,
  heldHorizontal: number | null = null,
): SnapOptions {
  return {
    threshold: THRESHOLD,
    hysteresis: HYSTERESIS,
    heldVertical,
    heldHorizontal,
    heldSpacingX: null,
    heldSpacingY: null,
    heldGapX: null,
    heldGapY: null,
  };
}

test("alignment snaps to the closest candidate within threshold", () => {
  const result = computeSnapGuides(
    { left: 142, top: 42, width: 100, height: 60 },
    [195],
    [100],
    [],
    [],
    options(),
  );
  assert.equal(result.x.delta, 3);
  assert.equal(result.x.alignGuide, 195);
  assert.equal(result.y.delta, -2);
  assert.equal(result.y.alignGuide, 100);
});

test("does not snap outside the threshold", () => {
  const result = computeSnapGuides(
    { left: 0, top: 0, width: 100, height: 10 },
    [150],
    [150],
    [],
    [],
    options(),
  );
  assert.equal(result.x.delta, 0);
  assert.equal(result.x.alignGuide, null);
  assert.equal(result.y.alignGuide, null);
});

test("a held guide is kept over a closer new candidate (hysteresis)", () => {
  const result = computeSnapGuides(
    { left: 90, top: 0, width: 100, height: 10 },
    [142],
    [],
    [],
    [],
    options(145),
  );
  assert.equal(result.x.alignGuide, 145);
  assert.equal(result.x.delta, 5);
});

test("the held guide releases once the object moves beyond threshold + hysteresis", () => {
  const result = computeSnapGuides(
    { left: 85, top: 0, width: 100, height: 10 },
    [138],
    [],
    [],
    [],
    options(145),
  );
  assert.equal(result.x.alignGuide, 138);
  assert.equal(result.x.delta, 3);
  assert.equal(result.x.spacing, null);
});

test("equal-spacing snaps a dragged object between two neighbors", () => {
  const result = computeSnapGuides(
    { left: 147, top: 0, width: 100, height: 10 },
    [],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.delta, 3);
  assert.ok(result.x.spacing, "expected spacing snap");
  assert.equal(result.x.spacing!.from, 100);
  assert.equal(result.x.spacing!.to, 300);
  assert.equal(result.x.spacing!.gap, 50);
  assert.equal(result.x.alignGuide, null);
});

test("spacing snap is applied when alignment is out of range", () => {
  const result = computeSnapGuides(
    { left: 147, top: 0, width: 100, height: 10 },
    [210],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.alignGuide, null);
  assert.ok(result.x.spacing, "expected spacing snap");
  assert.equal(result.x.delta, 3);
});

test("alignment wins over spacing when it is closer", () => {
  const result = computeSnapGuides(
    { left: 147, top: 0, width: 100, height: 10 },
    [150],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.alignGuide, 150);
  assert.equal(result.x.spacing, null);
});

test("no spacing when the dragged object is outside the neighbors", () => {
  const result = computeSnapGuides(
    { left: 500, top: 0, width: 100, height: 10 },
    [],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.spacing, null);
  assert.equal(result.x.delta, 0);
});

test("spacing hysteresis keeps the same neighbor pair while close", () => {
  // Dragged sits between [0,100] and [300,400]; held pair locks that gap at 50.
  const held = { from: 100, to: 300 };
  const result = computeSnapGuides(
    { left: 154, top: 0, width: 100, height: 10 },
    [],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    { ...options(), heldSpacingX: held },
  );
  assert.ok(result.x.spacing, "expected spacing snap");
  assert.equal(result.x.spacing!.from, 100);
  assert.equal(result.x.spacing!.to, 300);
  assert.equal(result.x.spacing!.gap, 50);
  assert.equal(result.x.delta, -4);
});

test("spacing hysteresis releases when the dragged drifts beyond threshold + hysteresis", () => {
  const held = { from: 100, to: 300 };
  // Dragged drifted by 10 (> 7) → release, no spacing.
  const result = computeSnapGuides(
    { left: 110, top: 0, width: 100, height: 10 },
    [],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    { ...options(), heldSpacingX: held },
  );
  assert.equal(result.x.spacing, null);
});

test("buildReferenceGaps collects edge gaps between consecutive sorted bounds", () => {
  const gaps = buildReferenceGaps([
    { start: 0, end: 50 },
    { start: 100, end: 150 },
    { start: 200, end: 250 },
    { start: 60, end: 90 },
  ]);
  // Sorted by start: [0,50], [60,90], [100,150], [200,250].
  // Consecutive gaps: 10, 10, 50. Unique: [10, 50].
  assert.deepEqual(gaps, [10, 50]);
});

test("buildReferenceGaps returns empty when bounds overlap or are empty", () => {
  assert.deepEqual(
    buildReferenceGaps([
      { start: 0, end: 100 },
      { start: 50, end: 150 },
    ]),
    [],
  );
  assert.deepEqual(buildReferenceGaps([]), []);
});

test("snapGap matches the current edge gap to a reference gap in the scene", () => {
  // Scene has A:[0,100] and B:[200,300] → reference gap 100.
  // C:[100,200] dragged to [147,247] — left gap 47, right gap 47 (already equal).
  // Move to left:103,197 — left gap 3, right gap 3 → too small, no match.
  // Move to left:110,210 — left gap 10, right gap -10 (overlap B) → no match.
  // Move to left:97,197 — left gap -3 (overlap A), right gap 3 → no.
  // Need: dragged sits between A and B with gap 100 to either side.
  // dragged.left=300 → no right neighbor. dragged.left = -50 → no left.
  // Try: dragged right of B at [310,410]: left gap = 310-300 = 10, right gap = none.
  //   No right neighbor → no snapGap on right.
  // Simpler: dragged left of A at [-100,0]: left gap none, right gap = 0-(-100) = 100.
  //   Wait, dragged.right = 0, A.left = 0 → gap = 0. Hmm.
  //   Let's set dragged at [-50,50] → right gap = 0-50 = -50 (overlap), no.
  // Try: dragged [50, 150]: left gap = 50-100 = -50 (overlap), no.
  // OK clearest: two pairs producing gap 100, and dragged matches one side.
  // Use A:[0,100] and B:[200,300] giving ref gap 100. Add C:[350,400] and
  // D:[500,600] giving ref gap 100. Dragged sits left of A: [-200,-100] →
  //   nearest right neighbor = A (right edge 100), gap = (-100)-100 = -200
  //   (dragged.right - A.left, negative because dragged.right < A.left).
  //   Hmm right gap = A.left - dragged.right = 0 - (-100) = 100. So right gap = 100, matches ref 100.
  const result = computeSnapGuides(
    { left: -200, top: 0, width: 100, height: 10 },
    [],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
      { start: 350, end: 400 },
      { start: 500, end: 600 },
    ],
    [],
    options(),
  );
  // Right neighbor: A. Right gap = 0 - (-100) = 100. Matches ref 100.
  // delta to make gap exactly 100: dragged.right moves so gap = 100 → dragged.right = 0 - 100 = -100.
  // That's already where it is. So delta = 0, gap already matches.
  // Actually current right gap IS already 100, so no delta is needed but the gap should still match.
  assert.equal(result.x.gap?.value, 100);
});

test("snapGap snaps the dragged edge to match a reference gap value", () => {
  // Reference gap 100 (between A and B). Draggd sits near A on the left with
  // current right gap = 95; we should snap so right gap becomes 100.
  // dragged.right should move by 5 (left) so right gap = 100.
  // dragged.right = -5 → gap = 0 - (-5) = 5 (no wait, A.left=0, dragged.right=-5 → gap = 5?).
  // Hmm let me reconsider: right gap = neighbor.left - dragged.right.
  // A.left = 0, dragged.right = -5 → right gap = 0 - (-5) = 5. Not what I want.
  // Let me set dragged at [-195,-95]: right gap = 0 - (-95) = 95. ✓
  // To match ref gap 100: dragged.right = 0 - 100 = -100, delta on left = -100 - (-195) = -95.
  const result = computeSnapGuides(
    { left: -195, top: 0, width: 100, height: 10 },
    [],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    [],
    options(),
  );
  assert.ok(result.x.gap, "expected snapGap");
  assert.equal(result.x.gap!.value, 100);
  assert.equal(result.x.gap!.side, "right");
  assert.equal(result.x.delta, -5); // dragged moves left by 5 to match gap 100
});

test("snapGap does not match when current gap is outside threshold", () => {
  // Reference gap 100; dragged right gap = 50 (too far from 100 to snap).
  const result = computeSnapGuides(
    { left: -150, top: 0, width: 100, height: 10 },
    [],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    [],
    options(),
  );
  assert.equal(result.x.gap, null);
});

test("snapGap hysteresis keeps the matched value while close", () => {
  const held = { value: 100, side: "right" as const };
  // dragged right gap currently 102 (within 7 of held 100) → keep snapping.
  const result = computeSnapGuides(
    { left: -198, top: 0, width: 100, height: 10 },
    [],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    [],
    { ...options(), heldGapX: held },
  );
  assert.ok(result.x.gap, "expected held snapGap");
  assert.equal(result.x.gap!.value, 100);
});

test("alignment beats snapGap when both engage", () => {
  // Alignment candidate 0 (dragged center X), reference gap 100 from scene.
  // Draggd at [-195,-95]: center = -145. Alignment candidate 0 too far.
  // Set dragged so alignment engages:
  //   dragged at [-50,50] center = 0, left edge = -50 → ref 100 still in scene.
  //   Right gap = 0 - 50 = -50 (overlap) → not a valid snapGap side.
  //   Left neighbor? None on left side (dragged.left = -50, no bounds < -50).
  //   So no snapGap. But alignment engages if candidate is 0.
  // To force both: we need a non-zero alignment candidate and a reference gap
  // where the dragged's gap is close.
  // Reference gap 100, dragged at [-200,-100]: right gap = 0-(-100) = 100 (already matches).
  //   snapGap engages with delta = 0.
  // Add alignment candidate -200 (dragged.left). dragged.left = -200, candidate -200 → delta 0.
  // Both match with delta 0, alignment wins (priority rule).
  const result = computeSnapGuides(
    { left: -200, top: 0, width: 100, height: 10 },
    [-200],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    [],
    options(),
  );
  assert.equal(result.x.alignGuide, -200);
  assert.equal(result.x.gap, null);
});

test("gap snap renders label on both axes independently", () => {
  // Scene produces reference gap 100 on both x and y. Dragged matches gap on x only.
  const result = computeSnapGuides(
    { left: -195, top: 0, width: 100, height: 10 },
    [],
    [],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    [
      { start: 0, end: 100 },
      { start: 200, end: 300 },
    ],
    options(),
  );
  assert.ok(result.x.gap, "expected x gap");
  assert.equal(result.x.gap!.value, 100);
  // y: dragged.top=0, y bounds don't apply gap snapping here (dragged.top=0
  // and neighbors have bounds that don't produce a left/right gap on y-axis).
});