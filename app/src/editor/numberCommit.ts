/**
 * Parse a raw input string into a committable number. Returns null when the
 * text is empty/invalid or equals the last committed value, so no-op edits
 * never produce undo entries. Pure: unit tested without React.
 */
export function parseNumberCommit(
  raw: string,
  lastCommitted: number,
): number | null {
  if (raw.trim() === "") return null;
  const nextValue = Number(raw);
  if (!Number.isFinite(nextValue) || nextValue === lastCommitted) return null;
  return nextValue;
}
