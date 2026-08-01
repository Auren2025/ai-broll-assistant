import {
  Composition,
  registerRoot,
  type AnyZodObject,
  type CalculateMetadataFunction,
} from "remotion";
import { parseProject, type Project } from "../domain/projectSchema";
import { parseScene, type Scene } from "../domain/sceneSchema";
import { ProjectComposition } from "./ProjectComposition";

const PROJECT_ID = "video001";
const LOCAL_API_BASE = "http://127.0.0.1:3001";
const COMPOSITION_ID = "Video001";

interface StudioProps extends Record<string, unknown> {
  project: Project;
  scenes: Scene[];
}

function getProjectDurationInFrames(scenes: readonly Scene[]): number {
  if (scenes.length === 0) {
    return 0;
  }

  return Math.max(
    ...scenes.map(
      (scene) => scene.startFrame + scene.durationInFrames,
    ),
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return await response.json();
}

async function loadProjectFromLocalApi(
  projectId: string,
): Promise<StudioProps> {
  const rawProject = await fetchJson(
    `${LOCAL_API_BASE}/api/projects/${encodeURIComponent(projectId)}`,
  );
  const project = parseProject(rawProject);

  const scenes = await Promise.all(
    project.scenes.map(async (reference) => {
      const rawScene = await fetchJson(
        `${LOCAL_API_BASE}/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(reference.id)}`,
      );
      return parseScene(rawScene);
    }),
  );

  return { project, scenes };
}

const studioCalculateMetadata: CalculateMetadataFunction<StudioProps> =
  async () => {
    const { project, scenes } = await loadProjectFromLocalApi(PROJECT_ID);

    return {
      props: {
        project,
        scenes,
      },
      width: project.width,
      height: project.height,
      fps: project.fps,
      durationInFrames: getProjectDurationInFrames(scenes),
      defaultCodec: "prores",
      defaultVideoImageFormat: "png",
      defaultPixelFormat: "yuva444p10le",
      defaultProResProfile: "4444",
    };
  };

const defaultProps: StudioProps = {
  project: {
    schemaVersion: 1,
    id: PROJECT_ID,
    name: "",
    width: 1920,
    height: 1080,
    fps: 30,
    scenes: [],
  },
  scenes: [],
};

function RemotionRoot() {
  return (
    <>
      <Composition<AnyZodObject, StudioProps>
        id={COMPOSITION_ID}
        component={ProjectComposition}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
        calculateMetadata={studioCalculateMetadata}
      />
    </>
  );
}

export default RemotionRoot;

registerRoot(RemotionRoot);
