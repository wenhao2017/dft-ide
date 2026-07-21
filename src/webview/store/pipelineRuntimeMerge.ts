export interface TimestampedSnapshot {
  updatedAt: number;
}

export function mergeLatestSnapshot<T extends TimestampedSnapshot>(
  snapshots: Record<string, T>,
  key: string,
  incoming: T,
): Record<string, T> {
  const current = snapshots[key];
  if (current && current.updatedAt > incoming.updatedAt) {
    return snapshots;
  }
  return {
    ...snapshots,
    [key]: incoming,
  };
}
