import { test } from "node:test";
import assert from "node:assert/strict";
import { getTextRenderLayout } from "../src/remotion/textRenderLayout";

test("both mode: no wrapping, max-content width, auto height", () => {
  assert.deepEqual(getTextRenderLayout("both"), {
    wraps: false,
    widthMode: "max-content",
    fixedHeight: false,
  });
});

test("height mode: wraps at fixed width, auto height", () => {
  assert.deepEqual(getTextRenderLayout("height"), {
    wraps: true,
    widthMode: "fixed",
    fixedHeight: false,
  });
});

test("fixed mode: wraps at fixed width, locked height", () => {
  assert.deepEqual(getTextRenderLayout("fixed"), {
    wraps: true,
    widthMode: "fixed",
    fixedHeight: true,
  });
});
