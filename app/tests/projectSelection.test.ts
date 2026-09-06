import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PROJECT_ID,
  resolveProjectId,
} from "../src/projectSelection";

test("project selection defaults to my-design", () => {
  assert.equal(DEFAULT_PROJECT_ID, "my-design");
  assert.equal(resolveProjectId(""), "my-design");
  assert.equal(resolveProjectId("?project=invalid%20id"), "my-design");
});

test("project selection accepts a project path", () => {
  assert.equal(resolveProjectId("", "/pi-agent-02"), "pi-agent-02");
  assert.equal(resolveProjectId("", "/pi-agent-02/"), "pi-agent-02");
});

test("a valid query parameter overrides the project path", () => {
  assert.equal(
    resolveProjectId("?project=pi-agent-02", "/my-design"),
    "pi-agent-02",
  );
});
