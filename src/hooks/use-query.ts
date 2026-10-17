import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

/**
 * Loads async data (SQLite, API) and reloads it when `deps` change or the screen
 * regains focus. State is only set from the promise callback, after unmount checks.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetcher()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => console.warn('[query]', e));
    return () => {
      alive = false;
    };
    // `fetcher` is recreated every render; `deps` describe what it actually reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useFocusEffect(reload);
  return { data, reload };
}
