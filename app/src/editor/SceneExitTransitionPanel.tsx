import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { BufferedNumberInput } from "./BufferedNumberInput";

/**
 * Spinner step (seconds) for the exit-transition duration number input.
 * The underlying model stores whole frames, so typed values still round to
 * the nearest frame; this only controls how far each spinner click moves.
 * 0.1s feels snappier than a single frame (1/30s) for timing tweaks.
 */
const EXIT_TRANSITION_STEP_SECONDS = 0.1;

interface SceneExitTransitionPanelProps {
  scene: Scene;
  project: Project;
  onSceneChange: (scene: Scene) => void;
}

export function SceneExitTransitionPanel({
  scene,
  project,
  onSceneChange,
}: SceneExitTransitionPanelProps) {
  function handleTypeChange(value: string): void {
    if (value === "none") {
      onSceneChange({ ...scene, exitTransition: undefined });
    } else if (value === "fade-out") {
      onSceneChange({
        ...scene,
        exitTransition: {
          type: "fade-out",
          durationInFrames: Math.max(1, Math.round(0.5 * project.fps)),
        },
      });
    }
  }

  function handleDurationChange(seconds: number): void {
    const frames = Math.min(
      scene.durationInFrames,
      Math.max(1, Math.round(seconds * project.fps)),
    );
    if (Number.isFinite(frames) && scene.exitTransition) {
      onSceneChange({
        ...scene,
        exitTransition: {
          ...scene.exitTransition,
          durationInFrames: frames,
        },
      });
    }
  }

  return (
    <section
      className="animation-control-section"
      aria-label="Scene exit transition"
    >
      <div className="animation-control-heading">
        <label>Exit transition</label>
        <select
          aria-label="Scene exit transition"
          className="animation-heading-select"
          value={scene.exitTransition?.type ?? "none"}
          onChange={(event) => handleTypeChange(event.currentTarget.value)}
        >
          <option value="none">None</option>
          <option value="fade-out">Fade out</option>
        </select>
      </div>
      {scene.exitTransition ? (
        <div className="animation-control-heading">
          <label>Duration</label>
          <div className="animation-time-input">
            <BufferedNumberInput
              // NOTE: min must stay a multiple of the step (0 here): the
              // native spinner anchors its step grid at min, so min={1/fps}
              // would make clicks land on 0.933/0.833 instead of 0.9/0.8.
              // The real floor (1 frame) is enforced in handleDurationChange.
              min={0}
              max={scene.durationInFrames / project.fps}
              step={EXIT_TRANSITION_STEP_SECONDS}
              aria-label="Exit transition duration in seconds"
              value={Number(
                (scene.exitTransition.durationInFrames / project.fps).toFixed(3),
              )}
              onValueChange={handleDurationChange}
            />
            <span>s</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
