import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumberCommit } from "../src/editor/numberCommit";

test("accepts a valid new number", () => {
  assert.equal(parseNumberCommit("1.5", 1), 1.5);
  assert.equal(parseNumberCommit("100", 0), 100);
});

test("accepts zero as a valid commit (falsy but finite)", () => {
  assert.equal(parseNumberCommit("0", 5), 0);
});

test("rejects empty or whitespace-only input", () => {
  assert.equal(parseNumberCommit("", 5), null);
  assert.equal(parseNumberCommit("   ", 5), null);
});

test("rejects non-numeric input", () => {
  assert.equal(parseNumberCommit("abc", 5), null);
  assert.equal(parseNumberCommit("1.2.3", 5), null);
});

test("rejects values equal to the last committed value (no-op edits)", () => {
  assert.equal(parseNumberCommit("5", 5), null);
  assert.equal(parseNumberCommit("5.0", 5), null);
});
