import {
  Composition,
  registerRoot,
  type AnyZodObject,
  type CalculateMetadataFunction,
} from "remotion";
import { LOCAL_API_BASE } from "../api/localService";
import { parseProject, type Project } from "../domain/projectSchema";
import { parseScene, type Scene } from "../domain/sceneSchema";
import { ProjectComposition } from "./ProjectComposition";

const DEFAULT_PROJECT_ID = "video001";
const COMPOSITION_ID = "Video001";
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

interface StudioProps extends Record<string, unknown> {
  projectId: string;
  project: Project;
  scenes: Scene[];
}

function resolveProjectId(): string {
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get("project");
    if (param && ID_PATTERN.test(param)) {
      return param;
    }
  }
  return DEFAULT_PROJECT_ID;
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
): Promise<{ project: Project; scenes: Scene[] }> {
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
  async ({ props }) => {
    const projectId =
      typeof props.projectId === "string" && ID_PATTERN.test(props.projectId)
        ? props.projectId
        : resolveProjectId();
    const { project, scenes } = await loadProjectFromLocalApi(projectId);

    return {
      props: {
        projectId,
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
  projectId: "",
  project: {
    schemaVersion: 1,
    id: "",
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
