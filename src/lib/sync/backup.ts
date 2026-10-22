// Optional cloud backup of the wallet. SQLite stays the source of truth; nothing leaves
// the device unless the user signed in and switched backup on.
import {
  applyRemoteCoupon,
  dirtyCoupons,
  markSynced,
  setPhotoPath,
  type RemoteCoupon,
} from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { getKv, getSettings, setKv, updateSettings } from '@/lib/db/settings';
import { missingStoreIds, upsertStore } from '@/lib/db/stores';
import { storesByIds } from '@/lib/api';
import { emitWalletChanged } from '@/lib/events';
import { readPhotoBytes } from '@/lib/photos';
import { requireSupabase, supabase } from '@/lib/supabase/client';

const BUCKET = 'coupon-photos';
const PULL_CURSOR = 'backup.pulledAt';

export type SyncResult = { pushed: number; pulled: number };

let running: Promise<SyncResult | null> | null = null;

/** Push local changes, then pull changes from other devices. No-op when backup is off. */
export function syncBackup(): Promise<SyncResult | null> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<SyncResult | null> {
  if (!supabase) return null;
  const db = await getDb();
  if (!(await getSettings(db)).backupEnabled) return null;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;

  // ---- push
  const dirty = await dirtyCoupons(db);
  for (const c of dirty) {
    const bytes = c.photoUri && !c.photoPath && !c.deletedAt ? await readPhotoBytes(c.photoUri) : null;
    if (bytes) {
      const path = `${uid}/${c.id}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (!error) {
        await setPhotoPath(db, c.id, path);
        c.photoPath = path;
      }
    }
  }
  if (dirty.length > 0) {
    const { error } = await supabase.from('coupons').upsert(
      dirty.map((c) => ({
        id: c.id,
        user_id: uid,
        amount_grosze: c.amountGrosze,
        issued_on: c.issuedOn,
        expires_on: c.expiresOn,
        barcode: c.barcode,
        barcode_type: c.barcodeType,
        store_id: c.storeId,
        status: c.status,
        redeemed_at: c.redeemedAt,
        note: c.note,
        photo_path: c.photoPath,
        client_updated_at: c.updatedAt,
        deleted_at: c.deletedAt,
      })),
    );
    if (error) throw error;
    for (const c of dirty) await markSynced(db, c.id, c.updatedAt);
  }

  // ---- pull
  let pulled = 0;
  let cursor = (await getKv(db, PULL_CURSOR)) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const { data: rows, error } = await supabase
      .from('coupons')
      .select('id, amount_grosze, issued_on, expires_on, barcode, barcode_type, store_id, status, redeemed_at, note, photo_path, client_updated_at, created_at, deleted_at, updated_at')
      .gt('updated_at', cursor)
      .order('updated_at')
      .limit(500);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const missing = await missingStoreIds(db, rows.flatMap((r) => (r.store_id ? [r.store_id] : [])));
    if (missing.length > 0) {
      for (const s of await storesByIds(missing).catch(() => [])) {
        await upsertStore(db, {
          id: s.id, name: s.name, brand: s.brand, lat: s.lat, lon: s.lon, street: s.street,
          housenumber: s.housenumber, city: s.city, machineCount: s.machine_count, machineId: s.machine_id,
        });
      }
    }
    const stillMissing = new Set(await missingStoreIds(db, missing));
    for (const { updated_at, ...r } of rows) {
      const remote: RemoteCoupon = { ...r, store_id: r.store_id && stillMissing.has(r.store_id) ? null : r.store_id };
      if ((await applyRemoteCoupon(db, remote)) !== 'skipped') pulled++;
      cursor = updated_at;
    }
    await setKv(db, PULL_CURSOR, cursor);
    if (rows.length < 500) break;
  }

  if (pulled > 0) emitWalletChanged();
  return { pushed: dirty.length, pulled };
}

/** Turns backup on: everything local is pushed on the next sync. Requires a session. */
export async function enableBackup(): Promise<SyncResult | null> {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('not_authenticated');
  const db = await getDb();
  await db.runAsync('update coupons set dirty = 1');
  await updateSettings(db, { backupEnabled: true });
  await client.from('profiles').update({ backup_enabled: true }).eq('id', data.session.user.id);
  return syncBackup();
}

export async function disableBackup({ deleteRemote }: { deleteRemote: boolean }): Promise<void> {
  const db = await getDb();
  await updateSettings(db, { backupEnabled: false });
  await setKv(db, PULL_CURSOR, null);
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  await client.from('profiles').update({ backup_enabled: false }).eq('id', uid);
  if (deleteRemote) {
    const { error } = await client.from('coupons').delete().eq('user_id', uid);
    if (error) throw error;
    const { data: files } = await client.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (files && files.length > 0) await client.storage.from(BUCKET).remove(files.map((f) => `${uid}/${f.name}`));
    await db.runAsync('update coupons set photo_path = null, synced_at = null, dirty = 1');
  }
}

/** Signed URL for a backed-up photo when the local file is missing (e.g. after restore). */
export async function remotePhotoUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
