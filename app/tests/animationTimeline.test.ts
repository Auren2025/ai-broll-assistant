import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScene, type Scene } from "../src/domain/sceneSchema";
import { getTimelineEvents } from "../src/editor/timelineEvents";

function animation(
  id: string,
  phase: "enter" | "emphasis" | "exit",
  startFrame: number,
  durationInFrames = 20,
) {
  return {
    id,
    phase,
    preset: "fade",
    startFrame,
    durationInFrames,
    easing: "ease-in",
  } as const;
}

function rect(id: string, x: number, y: number, zIndex: number) {
  return {
    id,
    name: id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex,
    visible: true,
    locked: false,
    animations: [],
    fill: "#ff0000",
    fillEnabled: true,
    stroke: null,
    strokeWidth: 0,
    strokePosition: "inside",
    cornerEnabled: true,
    cornerRadius: 0,
    cornerRadii: null,
  } as const;
}

function sceneWith(...layers: unknown[]): Scene {
  return parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "t",
    startFrame: 0,
    durationInFrames: 200,
    layers,
  });
}

test("build order follows zIndex desc, not animation startFrame", () => {
  const scene = sceneWith(
    {
      ...rect("bottom", 0, 0, 0),
      animations: [animation("a1", "enter", 150, 20)],
    },
    {
      ...rect("top", 0, 0, 2),
      animations: [animation("a2", "enter", 10, 20)],
    },
    {
      ...rect("middle", 0, 0, 1),
      animations: [animation("a3", "enter", 80, 20)],
    },
  );
  const events = getTimelineEvents(scene.layers);
  // Even though top's animation starts at frame 10 (earliest), the list
  // must be ordered by stacking: top (z=2), middle (z=1), bottom (z=0).
  assert.deepEqual(
    events.map((e) => e.layer.id),
    ["top", "middle", "bottom"],
  );
  // Each layer's animation is attached to the right row regardless of time.
  assert.equal(events[0].animation.id, "a2"); // top, frame 10
  assert.equal(events[1].animation.id, "a3"); // middle, frame 80
  assert.equal(events[2].animation.id, "a1"); // bottom, frame 150
});

test("animations within one layer stay sorted by startFrame", () => {
  const scene = sceneWith({
    ...rect("layer", 0, 0, 0),
    animations: [
      animation("exit", "exit", 150, 20),
      animation("enter", "enter", 0, 20),
      animation("emphasis", "emphasis", 80, 20),
    ],
  });
  const events = getTimelineEvents(scene.layers);
  assert.deepEqual(
    events.map((e) => e.animation.id),
    ["enter", "emphasis", "exit"],
  );
});

test("group children order follows zIndex within the group, after the group's own animations", () => {
  const scene = sceneWith({
    id: "g",
    name: "g",
    type: "group",
    x: 0,
    y: 0,
    width: 500,
    height: 500,
    rotation: 0,
    opacity: 1,
    opacityEnabled: true,
    blendMode: "normal",
    zIndex: 0,
    visible: true,
    locked: false,
    animations: [animation("g1", "enter", 100, 20)],
    children: [
      {
        ...rect("childLow", 0, 0, 0),
        animations: [animation("c1", "enter", 5, 20)],
      },
      {
        ...rect("childHigh", 0, 0, 1),
        animations: [animation("c2", "enter", 30, 20)],
      },
    ],
  });
  const events = getTimelineEvents(scene.layers);
  // Group's own animation first, then children by zIndex desc (childHigh
  // before childLow), regardless of their startFrames.
  assert.deepEqual(
    events.map((e) => e.layer.id),
    ["g", "childHigh", "childLow"],
  );
  assert.deepEqual(events.map((e) => e.depth), [0, 1, 1]);
});
