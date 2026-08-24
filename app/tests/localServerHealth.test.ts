import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalServerIsHealthy } from "../scripts/localServerHealth";

test("render health check accepts the local server health response", async () => {
  await assert.doesNotReject(
    assertLocalServerIsHealthy(
      async () => new Response('{"status":"ok"}', { status: 200 }),
    ),
  );
});

test("render health check gives an actionable server failure", async () => {
  await assert.rejects(
    assertLocalServerIsHealthy(async () => {
      throw new Error("connection refused");
    }),
    /required for rendering.*npm run dev:server/is,
  );
});
