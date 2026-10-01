import test from "node:test";
import assert from "node:assert/strict";
import {
  PASTEBOARD_BASE,
  PASTEBOARD_DARK,
  PASTEBOARD_DIM,
  PASTEBOARD_MARGIN_MIN,
  PASTEBOARD_MARGIN_MAX,
  pasteboardDimRects,
  pasteboardMargin,
  canonicalViewport,
  zoomViewport,
  projectFrameRect,
} from "../src/editor/pasteboard.ts";

test("pasteboardMargin is a third of the shorter side, clamped", () => {
  assert.equal(pasteboardMargin(1920, 1080), 360);
  assert.equal(pasteboardMargin(1080, 1920), 360);
  // Tiny project: clamped to the minimum.
  assert.equal(pasteboardMargin(200, 200), PASTEBOARD_MARGIN_MIN);
  // Huge project: clamped to the maximum so the backing store stays sane.
  assert.equal(pasteboardMargin(8000, 8000), PASTEBOARD_MARGIN_MAX);
});

test("canonicalViewport folds the margin into the pan", () => {
  assert.deepEqual(canonicalViewport(0.5, 360), {
    scale: 0.5,
    panX: 180,
    panY: 180,
  });
});

test("zoomViewport without a cursor re-anchors to the canonical origin", () => {
  const next = zoomViewport({
    prev: { scale: 0.5, panX: 999, panY: 999 },
    scale: 1,
    margin: 360,
    cursor: null,
    rectAfter: null,
  });
  assert.deepEqual(next, { scale: 1, panX: 360, panY: 360 });
});

test("zoomViewport keeps the scene point under the cursor fixed", () => {
  const margin = 360;
  const prev = canonicalViewport(0.5, margin);
  // Cursor at element pixel (400, 300); the rect it was measured against
  // starts at (50, 60) in client coords.
  const cursor = { x: 400, y: 300, rectLeft: 50, rectTop: 60 };
  // After resize the element's top-left moved to (40, 55).
  const rectAfter = { left: 40, top: 55 };
  const next = zoomViewport({ prev, scale: 1, margin, cursor, rectAfter });

  const sceneX = (cursor.x - cursor.rectLeft - prev.panX) / prev.scale;
  const sceneY = (cursor.y - cursor.rectTop - prev.panY) / prev.scale;
  // The same scene point maps back to the cursor under the new viewport.
  assert.equal(next.panX + sceneX * next.scale, cursor.x - rectAfter.left);
  assert.equal(next.panY + sceneY * next.scale, cursor.y - rectAfter.top);
});

test("zoomViewport with margin 0 matches the old origin-anchored behavior", () => {
  const prev = { scale: 1, panX: 0, panY: 0 };
  const next = zoomViewport({
    prev,
    scale: 2,
    margin: 0,
    cursor: null,
    rectAfter: null,
  });
  assert.deepEqual(next, { scale: 2, panX: 0, panY: 0 });
});

test("projectFrameRect is the viewport-shifted project in element pixels", () => {
  // With the margin folded into the pan, the project frame starts at pan.
  const frame = projectFrameRect({
    scale: 0.5,
    panX: 180,
    panY: 180,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(frame, { x: 180, y: 180, width: 960, height: 540 });
});

test("pasteboardDimRects tile the element minus the project frame", () => {
  const frame = { x: 180, y: 180, width: 960, height: 540 };
  const rects = pasteboardDimRects(1320, 900, frame);
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
  assert.equal(dimArea + frame.width * frame.height, 1320 * 900);
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
