import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDragTarget } from "../src/editor/fabricTargetResolution";

interface TargetNode {
  id?: string;
  kind: "group" | "shape" | "shape-internal" | "text";
  parent?: TargetNode;
  owner?: TargetNode;
}

function resolve(rawTarget: TargetNode, selectedLayerIds: readonly string[]) {
  return resolveDragTarget(
    rawTarget,
    selectedLayerIds,
    (target) => target.owner ?? target,
    (target) => target.parent,
    (target) => target.id,
    (target) => target.kind === "group",
  );
}

test("shape internals resolve to their selected owning shape", () => {
  const shape: TargetNode = { id: "shape", kind: "shape" };
  const text: TargetNode = {
    kind: "shape-internal",
    parent: shape,
    owner: shape,
  };
  assert.equal(resolve(text, ["shape"]), shape);
});

test("shape internals resolve to an already selected outer domain group", () => {
  const group: TargetNode = { id: "group", kind: "group" };
  const shape: TargetNode = { id: "shape", kind: "shape", parent: group };
  const text: TargetNode = {
    kind: "shape-internal",
    parent: shape,
    owner: shape,
  };
  assert.equal(resolve(text, ["group"]), group);
});

test("explicitly selected shape child wins over its outer group", () => {
  const group: TargetNode = { id: "group", kind: "group" };
  const shape: TargetNode = { id: "shape", kind: "shape", parent: group };
  const text: TargetNode = {
    kind: "shape-internal",
    parent: shape,
    owner: shape,
  };
  assert.equal(resolve(text, ["shape"]), shape);
});

test("unselected domain children keep group-first canvas interaction", () => {
  const group: TargetNode = { id: "group", kind: "group" };
  const text: TargetNode = { id: "text", kind: "text", parent: group };
  assert.equal(resolve(text, []), group);
});

test("ordinary top-level text remains independently draggable", () => {
  const text: TargetNode = { id: "text", kind: "text" };
  assert.equal(resolve(text, ["text"]), text);
});
