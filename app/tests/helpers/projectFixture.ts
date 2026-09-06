import { parseProject } from "../../src/domain/projectSchema";
import { parseScene } from "../../src/domain/sceneSchema";

export function makeProjectFixture(id = "test-project") {
  const scene = parseScene({
    schemaVersion: 1,
    id: "scene-001",
    topic: "First scene",
    startFrame: 0,
    durationInFrames: 30,
    layers: [],
  });
  const secondScene = parseScene({ ...scene, id: "scene-002", topic: "Second scene", startFrame: 60 });
  const project = parseProject({
    schemaVersion: 1,
    id,
    name: "Test project",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [scene, secondScene].map(({ id: sceneId }) => ({
      id: sceneId,
      file: `scenes/${sceneId}.json`,
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
