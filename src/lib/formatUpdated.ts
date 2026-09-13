/**
 * Humanise a timestamptz string into the "Edited 2h ago" label BoardCard
 * renders. Minimal on purpose — no relative-time lib.
 */
export const formatUpdated = (iso: string, now = new Date()): string => {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Edited just now';
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Edited ${weeks}w ago`;
  return `Edited ${then.toLocaleDateString()}`;
};
