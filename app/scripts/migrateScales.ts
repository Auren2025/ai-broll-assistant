import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseScene } from "../src/domain/sceneSchema";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function migrateLayer(layer: Record<string, unknown>): Record<string, unknown> {
  const x = layer.x as number;
  const y = layer.y as number;
  const width = layer.width as number;
  const height = layer.height as number;
  const scaleX = (layer.scaleX as number | undefined) ?? 1;
  const scaleY = (layer.scaleY as number | undefined) ?? 1;
  const newWidth = round(width * scaleX);
  const newHeight = round(height * scaleY);
  const newX = round(x + (width - newWidth) / 2);
  const newY = round(y + (height - newHeight) / 2);
  const next: Record<string, unknown> = { ...layer };
  delete next.scaleX;
  delete next.scaleY;
  next.width = newWidth;
  next.height = newHeight;
  next.x = newX;
  next.y = newY;

  if (next.type === "group") {
    const children = ((layer.children ?? []) as Record<string, unknown>[]).map(
      (child) => migrateLayer(child),
    );
    next.children = children;
  }

  return next;
}

function migrateScene(scene: Record<string, unknown>): Record<string, unknown> {
  const layers = ((scene.layers ?? []) as Record<string, unknown>[]).map(
    (layer) => migrateLayer(layer),
  );
  return { ...scene, layers };
}

function migrateProject(projectDir: string): void {
  const scenesDir = join(projectDir, "scenes");
  const files = readdirSync(scenesDir).filter(
    (name) => name.endsWith(".json"),
  );

  let migratedCount = 0;

  for (const file of files) {
    const scenePath = join(scenesDir, file);
    const raw = readFileSync(scenePath, "utf-8");
    const json = JSON.parse(raw);
    const migrated = migrateScene(json);

    try {
      parseScene(migrated);
    } catch (err) {
      console.error(`Migration failed for ${scenePath}:`, (err as Error).message);
      process.exit(1);
    }

    writeFileSync(scenePath, JSON.stringify(migrated, null, 2) + "\n");
    migratedCount += 1;
    console.log(`Migrated ${scenePath}`);
  }

  console.log(
    `Migrated ${migratedCount} scene file(s) under ${projectDir}/scenes.`,
  );
}

const projectDir = process.argv[2];

if (!projectDir) {
  console.error("Usage: tsx scripts/migrateScales.ts <project-directory>");
  process.exitCode = 1;
} else {
  try {
    migrateProject(projectDir);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}