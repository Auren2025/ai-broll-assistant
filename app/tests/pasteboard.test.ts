import test from "node:test";
import assert from "node:assert/strict";
import {
  PASTEBOARD_BASE,
  PASTEBOARD_DARK,
  PASTEBOARD_DIM,
  PASTEBOARD_MARGIN_MIN,
  PASTEBOARD_STAGE_PADDING,
  pasteboardDimRects,
  marginsForViewport,
  pasteboardElementSize,
  canonicalViewport,
  projectFrameRect,
} from "../src/editor/pasteboard.ts";

test("marginsForViewport fills the area exactly at minimum zoom", () => {
  // User's window: 1020x582 CSS px area, min scale 0.25, 1920x1080 project.
  // (1920 + 2x) * 0.25 = 1020 - 40  =>  x = 1000
  // (1080 + 2y) * 0.25 = 582 - 40   =>  y = 544
  const margins = marginsForViewport({
    areaWidth: 1020,
    areaHeight: 582,
    minScale: 0.25,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(margins, { x: 1000, y: 544 });
  // The element really does fill the area minus the stage padding.
  const size = pasteboardElementSize(1920, 1080, margins);
  assert.equal(size.width * 0.25, 1020 - PASTEBOARD_STAGE_PADDING);
  assert.equal(size.height * 0.25, 582 - PASTEBOARD_STAGE_PADDING);
});

test("marginsForViewport floors tiny windows at PASTEBOARD_MARGIN_MIN", () => {
  const margins = marginsForViewport({
    areaWidth: 200,
    areaHeight: 200,
    minScale: 0.25,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(margins, {
    x: PASTEBOARD_MARGIN_MIN,
    y: PASTEBOARD_MARGIN_MIN,
  });
});

test("marginsForViewport is per-axis: wide project, tall window", () => {
  const margins = marginsForViewport({
    areaWidth: 1000,
    areaHeight: 2000,
    minScale: 0.25,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  // Width is the binding constraint; height gets a roomy margin.
  assert.ok(margins.x < margins.y);
  const size = pasteboardElementSize(1920, 1080, margins);
  assert.equal(size.width * 0.25, 1000 - PASTEBOARD_STAGE_PADDING);
  assert.equal(size.height * 0.25, 2000 - PASTEBOARD_STAGE_PADDING);
});

test("canonicalViewport folds the per-axis margins into the pan", () => {
  assert.deepEqual(canonicalViewport(0.5, { x: 1000, y: 544 }), {
    scale: 0.5,
    panX: 500,
    panY: 272,
  });
});

test("center-zoom always re-anchors to the canonical origin", () => {
  // Zoom is always center-zoom now: no cursor anchoring. The viewport
  // re-anchors to the canonical margin-folded origin on every zoom, and a
  // layout effect centers the DOM scroll — together the project never
  // moves, only resizes.
  const next = canonicalViewport(1, { x: 1000, y: 544 });
  assert.deepEqual(next, { scale: 1, panX: 1000, panY: 544 });
});

test("canonicalViewport with zero margins keeps the origin anchored", () => {
  const next = canonicalViewport(2, { x: 0, y: 0 });
  assert.deepEqual(next, { scale: 2, panX: 0, panY: 0 });
});

test("projectFrameRect is the viewport-shifted project in element pixels", () => {
  // With the margin folded into the pan, the project frame starts at pan.
  const frame = projectFrameRect({
    scale: 0.5,
    panX: 500,
    panY: 272,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(frame, { x: 500, y: 272, width: 960, height: 540 });
});

test("pasteboardDimRects tile the element minus the project frame", () => {
  const frame = { x: 500, y: 272, width: 960, height: 540 };
  const rects = pasteboardDimRects(1960, 1628, frame);
  assert.equal(rects.length, 4);
  // None of the dim rects may overlap the project frame itself.
  for (const r of rects) {
    const overlaps =
      r.x < frame.x + frame.width &&
      r.x + r.width > frame.x &&
      r.y < frame.y + frame.height &&
      r.y + r.height > frame.y;
    assert.equal(overlaps, false);
  }
  // Their union area plus the frame area equals the whole element.
  const dimArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  assert.equal(dimArea + frame.width * frame.height, 1960 * 1628);
});

test("PASTEBOARD_DARK is the PASTEBOARD_BASE + PASTEBOARD_DIM composite", () => {
  // The scroll area paints PASTEBOARD_DARK flat; the canvas element paints
  // the lighter base then the translucent dim over it. Both must agree or a
  // visible edge appears where the element ends.
  const hex = PASTEBOARD_BASE.replace("#", "");
  const base = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const dim = PASTEBOARD_DIM.match(/[\d.]+/g)!.map(Number);
  const composite = base.map((b, i) =>
    Math.round(b * (1 - dim[3]) + dim[i] * dim[3]),
  );
  const darkHex = PASTEBOARD_DARK.replace("#", "");
  const dark = [0, 2, 4].map((i) => parseInt(darkHex.slice(i, i + 2), 16));
  assert.deepEqual(dark, composite);
});
