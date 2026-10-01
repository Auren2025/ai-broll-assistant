import test from "node:test";
import assert from "node:assert/strict";
import {
  PASTEBOARD_MARGIN_MIN,
  PASTEBOARD_MARGIN_MAX,
  pasteboardMargin,
  canonicalViewport,
  zoomViewport,
  projectFrameRect,
  pasteboardDimRects,
} from "../src/editor/pasteboard.ts";

test("pasteboardMargin is a quarter of the shorter side, clamped", () => {
  assert.equal(pasteboardMargin(1920, 1080), 270);
  assert.equal(pasteboardMargin(1080, 1920), 270);
  // Tiny project: clamped to the minimum.
  assert.equal(pasteboardMargin(200, 200), PASTEBOARD_MARGIN_MIN);
  // Huge project: clamped to the maximum so the backing store stays sane.
  assert.equal(pasteboardMargin(8000, 8000), PASTEBOARD_MARGIN_MAX);
});

test("canonicalViewport folds the margin into the pan", () => {
  assert.deepEqual(canonicalViewport(0.5, 270), {
    scale: 0.5,
    panX: 135,
    panY: 135,
  });
});

test("zoomViewport without a cursor re-anchors to the canonical origin", () => {
  const next = zoomViewport({
    prev: { scale: 0.5, panX: 999, panY: 999 },
    scale: 1,
    margin: 270,
    cursor: null,
    rectAfter: null,
  });
  assert.deepEqual(next, { scale: 1, panX: 270, panY: 270 });
});

test("zoomViewport keeps the scene point under the cursor fixed", () => {
  const margin = 270;
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
    panX: 135,
    panY: 135,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(frame, { x: 135, y: 135, width: 960, height: 540 });
});

test("pasteboardDimRects cover exactly the element minus the project frame", () => {
  const elementWidth = 1230;
  const elementHeight = 810;
  const args = {
    elementWidth,
    elementHeight,
    scale: 0.5,
    panX: 135,
    panY: 135,
    projectWidth: 1920,
    projectHeight: 1080,
  };
  const rects = pasteboardDimRects(args);
  assert.equal(rects.length, 4);
  const dimArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  const frameArea = 960 * 540;
  assert.equal(dimArea, elementWidth * elementHeight - frameArea);
  // No dim rect overlaps the project frame.
  const frame = projectFrameRect(args);
  for (const rect of rects) {
    const overlaps =
      rect.x < frame.x + frame.width &&
      rect.x + rect.width > frame.x &&
      rect.y < frame.y + frame.height &&
      rect.y + rect.height > frame.y;
    assert.equal(overlaps, false);
  }
});

test("pasteboardDimRects drop empty regions when the frame touches an edge", () => {
  const rects = pasteboardDimRects({
    elementWidth: 960,
    elementHeight: 540,
    scale: 0.5,
    panX: 0,
    panY: 0,
    projectWidth: 1920,
    projectHeight: 1080,
  });
  assert.deepEqual(rects, []);
});
