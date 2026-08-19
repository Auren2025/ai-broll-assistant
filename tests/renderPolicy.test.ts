import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALPHA_PRORES_RENDER_ARGS,
  buildFinalRenderProps,
  FINAL_RENDER_PROPS,
  resolveSceneBackground,
  resolveInteractivePlaybackPolicy,
} from "../src/remotion/renderPolicy";

test("final render policy preserves alpha ProRes 4444 and excludes preview media", () => {
  assert.deepEqual(ALPHA_PRORES_RENDER_ARGS, [
    "--image-format=png",
    "--pixel-format=yuva444p10le",
    "--codec=prores",
    "--prores-profile=4444",
  ]);
  assert.deepEqual(FINAL_RENDER_PROPS, {
    includeAudio: false,
    previewBackdrop: false,
  });
});

test("final render props keep audio and preview backdrop disabled", () => {
  assert.deepEqual(buildFinalRenderProps("video-001"), {
    projectId: "video-001",
    includeAudio: false,
    previewBackdrop: false,
  });
});

test("Studio policy preserves explicit final-render false values", () => {
  assert.deepEqual(
    resolveInteractivePlaybackPolicy({
      includeAudio: false,
      previewBackdrop: false,
    }),
    { includeAudio: false, previewBackdrop: false },
  );
  assert.deepEqual(resolveInteractivePlaybackPolicy({}), {
    includeAudio: true,
    previewBackdrop: true,
  });
});

test("transparent scenes get black only when a preview backdrop is requested", () => {
  assert.equal(resolveSceneBackground(undefined, false), "transparent");
  assert.equal(resolveSceneBackground(null, true), "#000000");
  assert.equal(resolveSceneBackground("#123456", true), "#123456");
  assert.equal(resolveSceneBackground("#123456", false), "#123456");
});
