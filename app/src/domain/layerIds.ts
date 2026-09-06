import type { Layer } from "./sceneSchema";
import { getAllLayers } from "./groupOperations";

export function nextIdForType(usedIds: ReadonlySet<string>, type: string): string {
  const pattern = new RegExp(`^${type}-(\\d+)$`);
  let sequence = 0;

  for (const id of usedIds) {
    const match = pattern.exec(id);
    if (match) sequence = Math.max(sequence, Number(match[1]));
  }

  let candidate = `${type}-${sequence + 1}`;

  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${type}-${sequence + 1}`;
  }

  return candidate;
}

export function getNextLayerId(
  layers: readonly Layer[],
  type: string,
): string {
  const usedIds = new Set(getAllLayers(layers).map((layer) => layer.id));
  return nextIdForType(usedIds, type);
}

export function makeLayerIdGenerator(
  layers: readonly Layer[],
): (original: Layer) => string {
  const initial = getAllLayers(layers);
  const sequences = new Map<string, number>();
  for (const layer of initial) {
    const dashIndex = layer.id.lastIndexOf("-");
    if (dashIndex < 0) continue;
    const sequence = Number(layer.id.slice(dashIndex + 1));
    if (!Number.isFinite(sequence)) continue;
    const type = layer.id.slice(0, dashIndex);
    sequences.set(type, Math.max(sequences.get(type) ?? 0, sequence));
  }

  return (original: Layer): string => {
    const type = original.type === "group" ? "group" : original.type;
    const sequence = (sequences.get(type) ?? 0) + 1;
    sequences.set(type, sequence);
    return `${type}-${sequence}`;
  };
}