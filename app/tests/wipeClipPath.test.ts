import assert from "node:assert/strict";
import { test } from "node:test";
import type { WipeDirection } from "../src/domain/layerAnimationSchema";
import { getWipeClipPath } from "../src/remotion/wipeClipPath";

const directions: readonly WipeDirection[] = [
  "left-to-right",
  "right-to-left",
  "top-to-bottom",
  "bottom-to-top",
  "top-left-to-bottom-right",
  "top-right-to-bottom-left",
  "bottom-left-to-top-right",
  "bottom-right-to-top-left",
];

test("Wipe removes its mask at the exact final state", () => {
  for (const direction of directions) {
    assert.equal(getWipeClipPath(direction, 1), undefined);
  }
});

test("Wipe creates a hard-edged mask for every supported direction", () => {
  for (const direction of directions) {
    assert.match(getWipeClipPath(direction, 0.5) ?? "", /^polygon\(.+\)$/);
  }
  assert.equal(
    getWipeClipPath("left-to-right", 0.5),
    "polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)",
  );
  assert.equal(
    getWipeClipPath("top-left-to-bottom-right", 0.5),
    "polygon(0% 0%, 100% 0%, 0% 100%)",
  );
});
