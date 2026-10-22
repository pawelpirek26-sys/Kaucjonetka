import { useSyncExternalStore } from 'react';

// Bumped whenever wallet data changes so screens re-query SQLite.
let revision = 0;
const listeners = new Set<() => void>();

export function emitWalletChanged(): void {
  revision++;
  listeners.forEach((l) => l());
}

export function onWalletChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWalletRevision(): number {
  return useSyncExternalStore(onWalletChanged, () => revision);
}
