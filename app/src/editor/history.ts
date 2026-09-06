/** Snapshots are immutable domain/UI state owned by React, not a second store. */
export function recordHistorySnapshot<T>(undo: T[], redo: T[], snapshot: T): void {
  undo.push(snapshot);
  if (undo.length > 100) undo.shift();
  redo.length = 0;
}

/** Used in both directions; failed application restores the original stacks. */
export async function applyHistoryStep<T>(
  from: T[],
  to: T[],
  current: T,
  apply: (snapshot: T) => Promise<void>,
): Promise<void> {
  const target = from.pop();
  if (target === undefined) return;
  to.push(current);
  try {
    await apply(target);
  } catch (error: unknown) {
    to.pop();
    from.push(target);
    throw error;
  }
}
