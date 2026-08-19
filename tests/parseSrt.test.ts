import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSrt } from "../src/srt/parseSrt";

function srt(...blocks: string[]): string {
  return blocks.join("\n\n");
}

test("parseSrt accepts ordered, non-overlapping cues with index gaps", () => {
  const cues = parseSrt(
    srt(
      "1\n00:00:00,000 --> 00:00:01,000\nFirst",
      "3\n00:00:01,000 --> 00:00:02,000\nSecond",
    ),
  );
  assert.deepEqual(cues.map((cue) => cue.index), [1, 3]);
});

test("parseSrt rejects overlapping cues with a clear error", () => {
  assert.throws(
    () =>
      parseSrt(
        srt(
          "1\n00:00:00,000 --> 00:00:02,000\nFirst",
          "2\n00:00:01,999 --> 00:00:03,000\nSecond",
        ),
      ),
    /overlapping cues are not supported/i,
  );
});

test("parseSrt rejects duplicate or descending cue indexes", () => {
  assert.throws(
    () =>
      parseSrt(
        srt(
          "2\n00:00:00,000 --> 00:00:01,000\nFirst",
          "2\n00:00:01,000 --> 00:00:02,000\nSecond",
        ),
      ),
    /duplicate cue (?:id|index)|must be greater/i,
  );
});

test("parseSrt rejects cues that move backward in time", () => {
  assert.throws(
    () =>
      parseSrt(
        srt(
          "1\n00:00:02,000 --> 00:00:03,000\nFirst",
          "2\n00:00:01,000 --> 00:00:02,000\nSecond",
        ),
      ),
    /must be chronological/i,
  );
});
