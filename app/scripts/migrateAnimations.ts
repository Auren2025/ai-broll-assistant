import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseScene } from "../src/domain/sceneSchema";

type JsonObject = Record<string, unknown>;

const animationPattern = /\{[^{}]*"phase"\s*:\s*"(?:enter|emphasis|exit)"[^{}]*\}/g;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fadeAndMoveDirection(preset: string): string {
  switch (preset) {
    case "slide-down":
      return "top-to-bottom";
    case "slide-left":
      return "right-to-left";
    case "slide-right":
      return "left-to-right";
    case "fade":
    case "scale":
    case "slide-up":
      return "bottom-to-top";
    default:
      throw new Error(`Unsupported legacy Build In preset: ${preset}`);
  }
}

function travelDistance(layer: JsonObject, preset: string): number {
  if (preset === "fade" || preset === "scale") return 0;
  const horizontal = preset === "slide-left" || preset === "slide-right";
  const axisSize = Number(horizontal ? layer.width : layer.height);
  const legacyPixels = horizontal ? 120 : 80;
  return round(Math.min(400, (legacyPixels / axisSize) * 100));
}

function migrateAnimation(animation: JsonObject, layer: JsonObject): JsonObject {
  const preset = String(animation.preset);
  if (
    preset === "fade-and-move" ||
    preset === "magic-move" ||
    preset === "dissolve"
  ) {
    return animation;
  }

  const common = {
    id: animation.id,
    phase: animation.phase,
    startFrame: animation.startFrame,
    durationInFrames: animation.durationInFrames,
    easing: animation.easing,
  };

  if (animation.phase === "enter") {
    return {
      ...common,
      preset: "fade-and-move",
      direction: fadeAndMoveDirection(preset),
      travelDistance: travelDistance(layer, preset),
    };
  }

  if (animation.phase === "exit") {
    return { ...common, preset: "dissolve" };
  }

  if (animation.phase !== "emphasis") {
    throw new Error(`Unsupported animation phase: ${String(animation.phase)}`);
  }

  return {
    ...common,
    preset: "magic-move",
    translateX:
      preset === "slide-left" ? -40 : preset === "slide-right" ? 40 : 0,
    translateY:
      preset === "slide-up" ? -30 : preset === "slide-down" ? 30 : 0,
    scale: preset === "scale" ? 1.08 : 1,
    opacity: preset === "fade" ? 0.65 : 1,
  };
}

function collectAnimations(
  layers: JsonObject[],
  animationsById: Map<string, JsonObject>,
): void {
  for (const layer of layers) {
    const animations = (layer.animations ?? []) as JsonObject[];
    for (const animation of animations) {
      const id = String(animation.id);
      if (animationsById.has(id)) {
        throw new Error(`Animation id must be scene-unique for migration: ${id}`);
      }
      animationsById.set(id, migrateAnimation(animation, layer));
    }

    if (layer.type === "group") {
      collectAnimations((layer.children ?? []) as JsonObject[], animationsById);
    }
  }
}

function migrateSceneFile(scenePath: string): boolean {
  const raw = readFileSync(scenePath, "utf8");
  const source = JSON.parse(raw) as JsonObject;
  const animationsById = new Map<string, JsonObject>();
  collectAnimations((source.layers ?? []) as JsonObject[], animationsById);
  let changed = false;

  const migratedRaw = raw.replace(animationPattern, (animationText) => {
    const animation = JSON.parse(animationText) as JsonObject;
    const migrated = animationsById.get(String(animation.id));
    if (!migrated || migrated.preset === animation.preset) return animationText;
    changed = true;
    return JSON.stringify(migrated);
  });

  if (!changed) return false;
  parseScene(JSON.parse(migratedRaw));
  writeFileSync(scenePath, migratedRaw.endsWith("\n") ? migratedRaw : `${migratedRaw}\n`);
  return true;
}

function migrateProject(projectDirectory: string): void {
  const scenesDirectory = join(projectDirectory, "scenes");
  const sceneFiles = readdirSync(scenesDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort();
  let migratedCount = 0;

  for (const sceneFile of sceneFiles) {
    const scenePath = join(scenesDirectory, sceneFile);
    if (migrateSceneFile(scenePath)) {
      migratedCount += 1;
      console.log(`Migrated ${scenePath}`);
    }
  }

  console.log(`Migrated ${migratedCount} scene file(s).`);
}

const projectDirectory = process.argv[2];

if (!projectDirectory) {
  console.error("Usage: npm run migrate:animations -- projects/<project-id>");
  process.exitCode = 1;
} else {
  try {
    migrateProject(projectDirectory);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
