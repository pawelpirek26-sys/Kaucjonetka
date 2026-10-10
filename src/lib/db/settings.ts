import type { Db } from './types';

export type QuietHours = { enabled: boolean; start: string; end: string }; // 'HH:MM', local time

export type Settings = {
  geofencingEnabled: boolean;
  radiusM: number;
  dwellSeconds: number;
  quietHours: QuietHours;
  expiryRemindersEnabled: boolean;
  backupEnabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  geofencingEnabled: false,
  radiusM: 150,
  dwellSeconds: 90,
  quietHours: { enabled: true, start: '22:00', end: '08:00' },
  expiryRemindersEnabled: true,
  backupEnabled: false,
};

export const RADIUS_OPTIONS_M = [100, 150, 200, 300] as const;
export const DWELL_OPTIONS_S = [60, 90, 120] as const;

export async function getKv(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('select value from kv where key = ?', key);
  return row?.value ?? null;
}

export async function setKv(db: Db, key: string, value: string | null): Promise<void> {
  if (value === null) await db.runAsync('delete from kv where key = ?', key);
  else await db.runAsync('insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', key, value);
}

export async function getSettings(db: Db): Promise<Settings> {
  const raw = await getKv(db, 'settings');
  const stored = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...stored.quietHours },
  };
}

export async function updateSettings(db: Db, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(db)), ...patch };
  await setKv(db, 'settings', JSON.stringify(next));
  return next;
}
