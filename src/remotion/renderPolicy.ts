export const ALPHA_PRORES_RENDER_ARGS = [
  "--image-format=png",
  "--pixel-format=yuva444p10le",
  "--codec=prores",
  "--prores-profile=4444",
] as const;

export const FINAL_RENDER_PROPS = {
  includeAudio: false,
  previewBackdrop: false,
} as const;

export interface PlaybackPolicyInput {
  includeAudio?: boolean;
  previewBackdrop?: boolean;
}

export function resolveInteractivePlaybackPolicy(
  input: PlaybackPolicyInput,
): { includeAudio: boolean; previewBackdrop: boolean } {
  return {
    includeAudio: input.includeAudio !== false,
    previewBackdrop: input.previewBackdrop !== false,
  };
}

export function buildFinalRenderProps(projectId: string): {
  projectId: string;
  includeAudio: false;
  previewBackdrop: false;
} {
  return { projectId, ...FINAL_RENDER_PROPS };
}

export function resolveSceneBackground(
  backgroundColor: string | null | undefined,
  previewBackdrop: boolean,
): string {
  return backgroundColor ?? (previewBackdrop ? "#000000" : "transparent");
}
