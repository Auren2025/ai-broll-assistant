import { useEffect, useState } from "react";
import type { Project } from "../domain/projectSchema";
import type { Scene } from "../domain/sceneSchema";
import { BufferedNumberInput } from "./BufferedNumberInput";

interface ScenePropertiesPanelProps {
  scene: Scene;
  project: Project;
  sceneNumber: number;
  onProjectChange: (project: Project) => void;
  onSceneChange: (scene: Scene) => void;
}

const FORMAT_PRESETS = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "720p", width: 1280, height: 720 },
  { label: "Square", width: 1080, height: 1080 },
  { label: "Vertical", width: 1080, height: 1920 },
] as const;

function getFormatValue(width: number, height: number): string {
  return (
    FORMAT_PRESETS.find(
      (preset) => preset.width === width && preset.height === height,
    )?.label ?? "Custom"
  );
}

export function ScenePropertiesPanel({
  scene,
  project,
  sceneNumber,
  onProjectChange,
  onSceneChange,
}: ScenePropertiesPanelProps) {
  const fillEnabled = scene.backgroundColor != null;
  const [lastColor, setLastColor] = useState(
    scene.backgroundColor ?? "#ffffff",
  );
  const [colorInput, setColorInput] = useState(
    (scene.backgroundColor ?? "#ffffff").slice(1).toUpperCase(),
  );
  const [topicInput, setTopicInput] = useState(scene.topic);
  const [projectNameInput, setProjectNameInput] = useState(project.name);
  const color = scene.backgroundColor ?? lastColor;
  const maximumAnimationEnd = Math.max(
    1,
    ...scene.layers.flatMap((layer) => [
      ...layer.animations.map(
        (animation) => animation.startFrame + animation.durationInFrames,
      ),
      ...(layer.type === "group"
        ? layer.children.flatMap((child) =>
            child.animations.map(
              (animation) => animation.startFrame + animation.durationInFrames,
            ),
          )
        : []),
    ]),
  );

  useEffect(() => {
    if (scene.backgroundColor) {
      setLastColor(scene.backgroundColor);
      setColorInput(scene.backgroundColor.slice(1).toUpperCase());
    }
  }, [scene.backgroundColor]);

  useEffect(() => {
    setTopicInput(scene.topic);
  }, [scene.topic]);

  useEffect(() => {
    setProjectNameInput(project.name);
  }, [project.name]);

  function patchProjectSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      onProjectChange({ ...project, width, height });
    }
  }

  function patchColor(value: string): void {
    const normalized = `#${value.replace(/^#/, "")}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      const nextColor = normalized.toLowerCase();
      setLastColor(nextColor);
      onSceneChange({ ...scene, backgroundColor: nextColor });
    }
  }

  return (
    <section className="scene-design-panel" aria-label="Scene properties">
      <header className="scene-design-header">
        <span className="scene-design-icon" aria-hidden="true" />
        <h3>Scene {sceneNumber}</h3>
      </header>

      <section className="scene-design-section scene-topic-section">
        <label className="scene-design-row scene-topic-row">
          <span>Topic</span>
          <input
            type="text"
            aria-label="Scene topic"
            maxLength={120}
            value={topicInput}
            onChange={(event) => {
              setTopicInput(event.currentTarget.value);
              const value = event.currentTarget.value.trim();
              if (value.length > 0) {
                onSceneChange({ ...scene, topic: value });
              }
            }}
            onBlur={() => setTopicInput(scene.topic)}
          />
        </label>
      </section>

      <section className="scene-design-section scene-project-section">
        <h4>Project</h4>
        <label className="scene-design-row scene-topic-row">
          <span>Name</span>
          <input
            type="text"
            aria-label="Project name"
            maxLength={120}
            value={projectNameInput}
            onChange={(event) => {
              setProjectNameInput(event.currentTarget.value);
              const value = event.currentTarget.value.trim();
              if (value.length > 0) {
                onProjectChange({ ...project, name: value });
              }
            }}
            onBlur={() => setProjectNameInput(project.name)}
          />
        </label>
        <div className="scene-design-row">
          <span>Frame rate</span>
          <BufferedNumberInput
            min="1"
            aria-label="Project frame rate"
            value={project.fps}
            onValueChange={(value) => {
              const fps = Math.max(1, Math.round(value));
              if (Number.isFinite(fps) && fps !== project.fps) {
                onProjectChange({ ...project, fps });
              }
            }}
          />
        </div>
      </section>

      <section className="scene-design-section scene-layout-section">
        <h4>Layout</h4>
        <label className="scene-design-row">
          <span>Format</span>
          <select
            value={getFormatValue(project.width, project.height)}
            onChange={(event) => {
              const preset = FORMAT_PRESETS.find(
                (candidate) => candidate.label === event.currentTarget.value,
              );
              if (preset) patchProjectSize(preset.width, preset.height);
            }}
          >
            {getFormatValue(project.width, project.height) === "Custom" ? (
              <option>Custom</option>
            ) : null}
            {FORMAT_PRESETS.map((preset) => (
              <option key={preset.label}>{preset.label}</option>
            ))}
          </select>
        </label>
        <div className="scene-design-row">
          <span>Size</span>
          <div className="scene-size-inputs">
            <BufferedNumberInput
              min="1"
              aria-label="Scene width"
              value={project.width}
              onValueChange={(value) => patchProjectSize(value, project.height)}
            />
            <BufferedNumberInput
              min="1"
              aria-label="Scene height"
              value={project.height}
              onValueChange={(value) => patchProjectSize(project.width, value)}
            />
          </div>
        </div>
      </section>

      <section className="scene-design-section scene-fill-section">
        <div className="scene-section-heading">
          <h4>Fill</h4>
          <input
            className="scene-fill-toggle"
            type="checkbox"
            aria-label="Enable scene fill"
            checked={fillEnabled}
            onChange={(event) =>
              onSceneChange({
                ...scene,
                backgroundColor: event.currentTarget.checked ? color : null,
              })
            }
          />
        </div>
        <label className={`scene-design-row${fillEnabled ? "" : " is-disabled"}`}>
          <span>Color</span>
          <div className="scene-color-inputs">
            <input
              type="text"
              aria-label="Scene fill hex color"
              maxLength={7}
              value={colorInput}
              disabled={!fillEnabled}
              onChange={(event) => {
                setColorInput(event.currentTarget.value);
                patchColor(event.currentTarget.value);
              }}
              onBlur={() => setColorInput(color.slice(1).toUpperCase())}
            />
            <input
              type="color"
              aria-label="Choose scene fill color"
              value={color}
              disabled={!fillEnabled}
              onChange={(event) => {
                setColorInput(event.currentTarget.value.slice(1).toUpperCase());
                patchColor(event.currentTarget.value);
              }}
            />
          </div>
        </label>
      </section>

      <section className="scene-design-section scene-duration-section">
        <h4>Duration</h4>
        <div className="scene-duration-control">
          <BufferedNumberInput
            min={maximumAnimationEnd / project.fps}
            step={1 / project.fps}
            aria-label="Scene duration in seconds"
            value={Number((scene.durationInFrames / project.fps).toFixed(3))}
            onValueChange={(value) => {
              const frames = Math.max(
                maximumAnimationEnd,
                Math.round(value * project.fps),
              );
              if (Number.isFinite(frames)) {
                onSceneChange({ ...scene, durationInFrames: frames });
              }
            }}
          />
          <span>s</span>
        </div>
      </section>
    </section>
  );
}
