import type { SceneReference } from "./projectSchema";

/** Insert a page at a boundary in the original list (0 = before the first). */
export function moveSceneReference(
  references: readonly SceneReference[],
  sceneId: string,
  insertionIndex: number,
): SceneReference[] | null {
  const sourceIndex = references.findIndex((reference) => reference.id === sceneId);
  if (
    sourceIndex < 0 ||
    !Number.isInteger(insertionIndex) ||
    insertionIndex < 0 ||
    insertionIndex > references.length ||
    insertionIndex === sourceIndex ||
    insertionIndex === sourceIndex + 1
  ) {
    return null;
  }

  const reordered = [...references];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex, 0, moved);
  return reordered;
}
