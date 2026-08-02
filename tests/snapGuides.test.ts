import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSnapGuides } from "../src/editor/snapGuides";

// Screen-space snap margin is 5px, hysteresis 2px; these are the scene-unit
// values at 100% zoom (scale 1).
const THRESHOLD = 5;
const HYSTERESIS = 2;

function options(heldVertical: number | null = null, heldHorizontal: number | null = null) {
  return {
    threshold: THRESHOLD,
    hysteresis: HYSTERESIS,
    heldVertical,
    heldHorizontal,
  };
}

test("alignment snaps to the closest candidate within threshold", () => {
  const result = computeSnapGuides(
    { left: 142, top: 42, width: 100, height: 60 }, // center 192, bottom 102
    [195],
    [100],
    [],
    [],
    options(),
  );
  assert.equal(result.x.delta, 3); // center 192 -> 195
  assert.equal(result.x.alignGuide, 195);
  assert.equal(result.y.delta, -2); // bottom edge 102 -> 100
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
  // dragged center 140; held at 145 keeps 145 even though 142 is closer.
  const result = computeSnapGuides(
    { left: 90, top: 0, width: 100, height: 10 }, // center 140
    [142],
    [],
    [],
    [],
    options(145),
  );
  assert.equal(result.x.alignGuide, 145);
  assert.equal(result.x.delta, 5); // center 140 -> 145
});

test("the held guide releases once the object moves beyond threshold + hysteresis", () => {
  // dragged center 135; held at 145 is 10 away (> 7) -> release, then 138 snaps.
  const result = computeSnapGuides(
    { left: 85, top: 0, width: 100, height: 10 }, // center 135
    [138],
    [],
    [],
    [],
    options(145),
  );
  assert.equal(result.x.alignGuide, 138);
  assert.equal(result.x.delta, 3); // center 135 -> 138
  assert.equal(result.x.spacing, null);
});

test("equal-spacing snaps a dragged object between two neighbors", () => {
  // neighbors at [0,100] and [300,400]; dragged [147,247] -> equal-gap left 150.
  const result = computeSnapGuides(
    { left: 147, top: 0, width: 100, height: 10 },
    [],
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.delta, 3); // left 147 -> 150
  assert.ok(result.x.spacing, "expected spacing snap");
  assert.equal(result.x.spacing!.from, 100);
  assert.equal(result.x.spacing!.to, 300);
  assert.equal(result.x.spacing!.gap, 50);
  assert.equal(result.x.alignGuide, null);
});

test("spacing snap is applied when alignment is out of range", () => {
  const result = computeSnapGuides(
    { left: 147, top: 0, width: 100, height: 10 },
    [210], // too far for alignment
    [],
    [{ start: 0, end: 100 }, { start: 300, end: 400 }],
    [],
    options(),
  );
  assert.equal(result.x.alignGuide, null);
  assert.ok(result.x.spacing, "expected spacing snap");
  assert.equal(result.x.delta, 3); // left 147 -> 150
});

test("alignment wins over spacing when it is closer", () => {
  // alignment candidate 150 has delta 3 (left edge 147), spacing midpoint 150
  // also delta 3 -> tie, alignment wins.
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
