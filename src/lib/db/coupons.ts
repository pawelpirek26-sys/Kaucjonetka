import { type ISODate } from '@/lib/dates';

import { storeFromRow, type CachedStore } from './stores';
import type { Db, SqlValue } from './types';

export type CouponStatus = 'active' | 'redeemed' | 'expired';

export type Coupon = {
  id: string;
  amountGrosze: number;
  issuedOn: ISODate | null;
  expiresOn: ISODate | null;
  barcode: string | null;
  barcodeType: string | null;
  storeId: number | null;
  status: CouponStatus;
  redeemedAt: string | null;
  note: string | null;
  photoUri: string | null;
  photoPath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: boolean;
  syncedAt: string | null;
  store: CachedStore | null;
};

export type CouponInput = {
  amountGrosze: number;
  issuedOn: ISODate | null;
  expiresOn: ISODate | null;
  barcode: string | null;
  barcodeType: string | null;
  storeId: number | null;
  note: string | null;
  photoUri: string | null;
  ocrText?: string | null;
};

export type WalletSummary = {
  activeCount: number;
  activeSumGrosze: number;
  expiringSoonCount: number;
  expiringSoonSumGrosze: number;
};

export type StoreWithCoupons = CachedStore & { couponCount: number; sumGrosze: number };

type CouponRow = {
  id: string;
  amount_grosze: number;
  issued_on: string | null;
  expires_on: string | null;
  barcode: string | null;
  barcode_type: string | null;
  store_id: number | null;
  status: CouponStatus;
  redeemed_at: string | null;
  note: string | null;
  photo_uri: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: number;
  synced_at: string | null;
  // joined store columns (prefixed)
  s_id: number | null;
  s_name: string | null;
  s_brand: string | null;
  s_lat: number | null;
  s_lon: number | null;
  s_street: string | null;
  s_housenumber: string | null;
  s_city: string | null;
  s_machine_count: number | null;
  s_machine_id: number | null;
};

const SELECT_COUPON = `
  select c.*, s.id as s_id, s.name as s_name, s.brand as s_brand, s.lat as s_lat, s.lon as s_lon,
         s.street as s_street, s.housenumber as s_housenumber, s.city as s_city,
         s.machine_count as s_machine_count, s.machine_id as s_machine_id
    from coupons c
    left join stores_cache s on s.id = c.store_id`;

function fromRow(r: CouponRow): Coupon {
  return {
    id: r.id,
    amountGrosze: r.amount_grosze,
    issuedOn: r.issued_on,
    expiresOn: r.expires_on,
    barcode: r.barcode,
    barcodeType: r.barcode_type,
    storeId: r.store_id,
    status: r.status,
    redeemedAt: r.redeemed_at,
    note: r.note,
    photoUri: r.photo_uri,
    photoPath: r.photo_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    dirty: r.dirty === 1,
    syncedAt: r.synced_at,
    store:
      r.s_id === null
        ? null
        : storeFromRow({
            id: r.s_id,
            name: r.s_name,
            brand: r.s_brand,
            lat: r.s_lat!,
            lon: r.s_lon!,
            street: r.s_street,
            housenumber: r.s_housenumber,
            city: r.s_city,
            machine_count: r.s_machine_count ?? 0,
            machine_id: r.s_machine_id,
          }),
  };
}

/** Status a coupon should have on `today` (an active coupon past its last day expires). */
export function effectiveStatus(c: Pick<Coupon, 'status' | 'expiresOn'>, today: ISODate): CouponStatus {
  if (c.status === 'active' && c.expiresOn !== null && c.expiresOn < today) return 'expired';
  return c.status;
}

export async function insertCoupon(db: Db, id: string, input: CouponInput, now = new Date().toISOString()): Promise<Coupon> {
  await db.runAsync(
    `insert into coupons (id, amount_grosze, issued_on, expires_on, barcode, barcode_type, store_id, note,
                          photo_uri, ocr_text, status, created_at, updated_at, dirty)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 1)`,
    id, input.amountGrosze, input.issuedOn, input.expiresOn, input.barcode, input.barcodeType, input.storeId,
    input.note, input.photoUri, input.ocrText ?? null, now, now,
  );
  return (await getCoupon(db, id))!;
}

export async function updateCoupon(db: Db, id: string, input: CouponInput, now = new Date().toISOString()): Promise<Coupon> {
  await db.runAsync(
    `update coupons set amount_grosze = ?, issued_on = ?, expires_on = ?, barcode = ?, barcode_type = ?, store_id = ?,
                        note = ?, photo_uri = ?, updated_at = ?, dirty = 1
      where id = ?`,
    input.amountGrosze, input.issuedOn, input.expiresOn, input.barcode, input.barcodeType, input.storeId,
    input.note, input.photoUri, now, id,
  );
  return (await getCoupon(db, id))!;
}

export async function setCouponStatus(db: Db, id: string, status: CouponStatus, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `update coupons set status = ?, redeemed_at = case when ? = 'redeemed' then ? else null end,
                        updated_at = ?, dirty = 1
      where id = ?`,
    status, status, now, now, id,
  );
}

/** Soft delete so the deletion reaches the backup; never-synced coupons are removed outright. */
export async function deleteCoupon(db: Db, id: string, now = new Date().toISOString()): Promise<void> {
  await db.runAsync('delete from coupons where id = ? and synced_at is null', id);
  await db.runAsync('update coupons set deleted_at = ?, updated_at = ?, dirty = 1 where id = ?', now, now, id);
}

export async function getCoupon(db: Db, id: string): Promise<Coupon | null> {
  const row = await db.getFirstAsync<CouponRow>(`${SELECT_COUPON} where c.id = ? and c.deleted_at is null`, id);
  return row ? fromRow(row) : null;
}

export async function listCoupons(db: Db, status: CouponStatus): Promise<Coupon[]> {
  const order =
    status === 'active'
      ? 'c.expires_on is null, c.expires_on asc, c.created_at desc'
      : 'coalesce(c.redeemed_at, c.expires_on, c.updated_at) desc';
  const rows = await db.getAllAsync<CouponRow>(
    `${SELECT_COUPON} where c.status = ? and c.deleted_at is null order by ${order}`,
    status,
  );
  return rows.map(fromRow);
}

/** Marks active coupons whose last valid day has passed as expired. Returns how many changed. */
export async function expireOverdue(db: Db, today: ISODate, now = new Date().toISOString()): Promise<number> {
  const res = await db.runAsync(
    `update coupons set status = 'expired', updated_at = ?, dirty = 1
      where status = 'active' and deleted_at is null and expires_on is not null and expires_on < ?`,
    now, today,
  );
  return res.changes;
}

export async function walletSummary(db: Db, soonUntil: ISODate): Promise<WalletSummary> {
  const row = await db.getFirstAsync<{ n: number; total: number | null; soon_n: number; soon_total: number | null }>(
    `select count(*) as n, sum(amount_grosze) as total,
            count(*) filter (where expires_on is not null and expires_on <= ?) as soon_n,
            sum(amount_grosze) filter (where expires_on is not null and expires_on <= ?) as soon_total
       from coupons where status = 'active' and deleted_at is null`,
    soonUntil, soonUntil,
  );
  return {
    activeCount: row?.n ?? 0,
    activeSumGrosze: row?.total ?? 0,
    expiringSoonCount: row?.soon_n ?? 0,
    expiringSoonSumGrosze: row?.soon_total ?? 0,
  };
}

/** Stores where the user holds active coupons, with count and sum (geofence candidates). */
export async function activeCouponStores(db: Db): Promise<StoreWithCoupons[]> {
  const rows = await db.getAllAsync<Parameters<typeof storeFromRow>[0] & { coupon_count: number; sum_grosze: number }>(
    `select s.*, count(c.id) as coupon_count, sum(c.amount_grosze) as sum_grosze
       from coupons c
       join stores_cache s on s.id = c.store_id
      where c.status = 'active' and c.deleted_at is null
      group by s.id`,
  );
  return rows.map((r) => ({ ...storeFromRow(r), couponCount: r.coupon_count, sumGrosze: r.sum_grosze }));
}

export async function couponsAtStore(db: Db, storeId: number): Promise<{ count: number; sumGrosze: number }> {
  const row = await db.getFirstAsync<{ n: number; total: number | null }>(
    `select count(*) as n, sum(amount_grosze) as total from coupons
      where store_id = ? and status = 'active' and deleted_at is null`,
    storeId,
  );
  return { count: row?.n ?? 0, sumGrosze: row?.total ?? 0 };
}

export async function activeStoreIds(db: Db): Promise<number[]> {
  const rows = await db.getAllAsync<{ store_id: number }>(
    `select distinct store_id from coupons where status = 'active' and deleted_at is null and store_id is not null`,
  );
  return rows.map((r) => r.store_id);
}

export async function activeCouponsForReminders(db: Db): Promise<Coupon[]> {
  const rows = await db.getAllAsync<CouponRow>(
    `${SELECT_COUPON} where c.status = 'active' and c.deleted_at is null and c.expires_on is not null
      order by c.expires_on`,
  );
  return rows.map(fromRow);
}

// ---------------------------------------------------------------------------
// Backup sync helpers
// ---------------------------------------------------------------------------
export type DirtyCoupon = Omit<Coupon, 'store'>;

export async function dirtyCoupons(db: Db): Promise<DirtyCoupon[]> {
  const rows = await db.getAllAsync<CouponRow>(`${SELECT_COUPON} where c.dirty = 1`);
  return rows.map(fromRow);
}

export async function setPhotoPath(db: Db, id: string, path: string): Promise<void> {
  await db.runAsync('update coupons set photo_path = ? where id = ?', path, id);
}

/** Clears the dirty flag unless the coupon changed again while the push was in flight. */
export async function markSynced(db: Db, id: string, pushedUpdatedAt: string, now = new Date().toISOString()): Promise<void> {
  await db.runAsync('update coupons set dirty = 0, synced_at = ? where id = ? and updated_at = ?', now, id, pushedUpdatedAt);
  await db.runAsync('delete from coupons where id = ? and deleted_at is not null and dirty = 0', id);
}

export type RemoteCoupon = {
  id: string;
  amount_grosze: number;
  issued_on: string | null;
  expires_on: string | null;
  barcode: string | null;
  barcode_type: string | null;
  store_id: number | null;
  status: CouponStatus;
  redeemed_at: string | null;
  note: string | null;
  photo_path: string | null;
  client_updated_at: string;
  created_at: string;
  deleted_at: string | null;
};

/**
 * Merges a coupon pulled from the backup. Local unsynced edits win (they are pushed next
 * and the server keeps the newer client timestamp); otherwise the newer version wins.
 */
export async function applyRemoteCoupon(db: Db, r: RemoteCoupon, now = new Date().toISOString()): Promise<'inserted' | 'updated' | 'deleted' | 'skipped'> {
  const local = await db.getFirstAsync<{ updated_at: string; dirty: number }>('select updated_at, dirty from coupons where id = ?', r.id);
  if (local && (local.dirty === 1 || local.updated_at >= r.client_updated_at)) return 'skipped';

  if (r.deleted_at) {
    if (!local) return 'skipped';
    await db.runAsync('delete from coupons where id = ?', r.id);
    return 'deleted';
  }

  const values: SqlValue[] = [
    r.amount_grosze, r.issued_on, r.expires_on, r.barcode, r.barcode_type, r.store_id, r.status,
    r.redeemed_at, r.note, r.photo_path, r.client_updated_at, now,
  ];
  if (local) {
    await db.runAsync(
      `update coupons set amount_grosze = ?, issued_on = ?, expires_on = ?, barcode = ?, barcode_type = ?, store_id = ?,
                          status = ?, redeemed_at = ?, note = ?, photo_path = ?, updated_at = ?, synced_at = ?, dirty = 0
        where id = ?`,
      ...values, r.id,
    );
    return 'updated';
  }
  await db.runAsync(
    `insert into coupons (amount_grosze, issued_on, expires_on, barcode, barcode_type, store_id, status, redeemed_at,
                          note, photo_path, updated_at, synced_at, id, created_at, dirty)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ...values, r.id, r.created_at,
  );
  return 'inserted';
}
