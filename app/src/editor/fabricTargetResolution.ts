export function resolveDragTarget<T>(
  rawTarget: T,
  selectedLayerIds: readonly string[],
  canonicalize: (target: T) => T,
  getParent: (target: T) => T | undefined,
  getLayerId: (target: T) => string | undefined,
  isDomainGroup: (target: T) => boolean,
): T {
  const canonicalTarget = canonicalize(rawTarget);
  let current: T | undefined = canonicalTarget;

  while (current) {
    const layerId = getLayerId(current);
    if (layerId && selectedLayerIds.includes(layerId)) {
      return current;
    }
    current = getParent(current);
  }

  const parent = getParent(canonicalTarget);
  return parent && isDomainGroup(parent) ? parent : canonicalTarget;
}
