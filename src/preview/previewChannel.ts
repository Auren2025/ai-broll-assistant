import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";

export const PREVIEW_CHANNEL_NAME = "ai-broll-preview-sync";

export interface PreviewReadyMessage {
  type: "ready";
}

export interface PreviewStateMessage {
  type: "state";
  project: Project;
  scene: Scene;
  isDirty: boolean;
}

export type PreviewSyncMessage = PreviewReadyMessage | PreviewStateMessage;
