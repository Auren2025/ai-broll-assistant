import { parseProject } from "../../src/domain/projectSchema";
import { parseScene } from "../../src/domain/sceneSchema";

export function makeProjectFixture(id = "test-project") {
  const scene = parseScene({
    schemaVersion: 2,
    id: "scene-001",
    topic: "First scene",
    durationInFrames: 30,
    layers: [],
  });
  const secondScene = parseScene({ ...scene, id: "scene-002", topic: "Second scene" });
  const project = parseProject({
    schemaVersion: 2,
    id,
    kind: "broll",
    name: "Test project",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [scene, secondScene].map(({ id: sceneId }, index) => ({
      id: sceneId,
      file: `scenes/${sceneId}.json`,
      startFrame: index === 0 ? 0 : 60,
    })),
  });
  return { project, scene, secondScene };
}

export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
