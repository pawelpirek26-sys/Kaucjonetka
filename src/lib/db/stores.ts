import type { Db } from './types';

export type CachedStore = {
  id: number;
  name: string | null;
  brand: string | null;
  lat: number;
  lon: number;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  machineCount: number;
  machineId: number | null;
};

type StoreRow = {
  id: number;
  name: string | null;
  brand: string | null;
  lat: number;
  lon: number;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  machine_count: number;
  machine_id: number | null;
};

export function storeFromRow(r: StoreRow): CachedStore {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    lat: r.lat,
    lon: r.lon,
    street: r.street,
    housenumber: r.housenumber,
    city: r.city,
    machineCount: r.machine_count,
    machineId: r.machine_id,
  };
}

export function storeLabel(s: Pick<CachedStore, 'name' | 'brand'>): string {
  return s.name ?? s.brand ?? 'Sklep';
}

export function storeAddress(s: Pick<CachedStore, 'street' | 'housenumber' | 'city'>): string | null {
  const street = [s.street, s.housenumber].filter(Boolean).join(' ');
  return [street, s.city].filter(Boolean).join(', ') || null;
}

export async function upsertStore(db: Db, s: CachedStore, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `insert into stores_cache (id, name, brand, lat, lon, street, housenumber, city, machine_count, machine_id, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       name = excluded.name, brand = excluded.brand, lat = excluded.lat, lon = excluded.lon,
       street = excluded.street, housenumber = excluded.housenumber, city = excluded.city,
       machine_count = excluded.machine_count, machine_id = excluded.machine_id, updated_at = excluded.updated_at`,
    s.id, s.name, s.brand, s.lat, s.lon, s.street, s.housenumber, s.city, s.machineCount, s.machineId, now,
  );
}

export async function getStore(db: Db, id: number): Promise<CachedStore | null> {
  const row = await db.getFirstAsync<StoreRow>('select * from stores_cache where id = ?', id);
  return row ? storeFromRow(row) : null;
}

export async function missingStoreIds(db: Db, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await db.getAllAsync<{ id: number }>(
    `select id from stores_cache where id in (${ids.map(() => '?').join(',')})`,
    ...ids,
  );
  const known = new Set(rows.map((r) => r.id));
  return [...new Set(ids)].filter((id) => !known.has(id));
}

/** Stores the user picked recently (works offline as a fallback list). */
export async function recentStores(db: Db, limit = 5): Promise<CachedStore[]> {
  const rows = await db.getAllAsync<StoreRow>('select * from stores_cache order by updated_at desc limit ?', limit);
  return rows.map(storeFromRow);
}

export function storeFromNearest(s: {
  id: number;
  name: string | null;
  brand: string | null;
  lat: number;
  lon: number;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  machine_count: number;
  machine_id: number | null;
}): CachedStore {
  return storeFromRow(s);
}
