import { openDatabaseAsync } from 'expo-sqlite';

import { migrate } from './schema';
import type { Db } from './types';

let dbPromise: Promise<Db> | null = null;

/** Shared, migrated wallet database (also used from background tasks). */
export function getDb(): Promise<Db> {
  dbPromise ??= (async () => {
    const db = await openDatabaseAsync('kaucjomat.db');
    await migrate(db);
    return db;
  })().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}
