/**
 * @jest-environment node
 */
import { createTestDb } from '../../../../tests/helpers/nodeSqlite';
import {
  activeCouponStores,
  applyRemoteCoupon,
  couponsAtStore,
  deleteCoupon,
  dirtyCoupons,
  expireOverdue,
  getCoupon,
  insertCoupon,
  listCoupons,
  markSynced,
  setCouponStatus,
  walletSummary,
  type CouponInput,
} from '../coupons';
import { getGeofenceState, pendingOutside, saveGeofenceState, emptyGeofenceState } from '../geofenceState';
import { migrate, SCHEMA_VERSION } from '../schema';
import { getSettings, updateSettings } from '../settings';
import { missingStoreIds, upsertStore, type CachedStore } from '../stores';

const lidl: CachedStore = {
  id: 1001, name: 'Lidl', brand: 'Lidl', lat: 52.2297, lon: 21.0122,
  street: 'Marszałkowska', housenumber: '104', city: 'Warszawa', machineCount: 1, machineId: 2001,
};
const zabka: CachedStore = { ...lidl, id: 1002, name: 'Żabka', brand: 'Żabka', machineCount: 0, machineId: null };

const input = (patch: Partial<CouponInput> = {}): CouponInput => ({
  amountGrosze: 350, issuedOn: '2026-10-05', expiresOn: '2026-11-04', barcode: '5901234123457',
  barcodeType: 'ean13', storeId: 1001, note: null, photoUri: null, ...patch,
});

describe('wallet repositories (real SQLite)', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await migrate(db);
    await upsertStore(db, lidl);
    await upsertStore(db, zabka);
  });
  afterEach(() => db.close());

  it('migrates idempotently', async () => {
    await migrate(db);
    expect((await db.getFirstAsync<{ user_version: number }>('pragma user_version'))?.user_version).toBe(SCHEMA_VERSION);
  });

  it('stores coupons with their store and sums active ones', async () => {
    await insertCoupon(db, 'a', input());
    await insertCoupon(db, 'b', input({ amountGrosze: 150, expiresOn: '2026-10-12' }));
    await insertCoupon(db, 'c', input({ amountGrosze: 1000, storeId: 1002, expiresOn: null }));
    await setCouponStatus(db, 'c', 'redeemed', '2026-10-10T10:00:00.000Z');

    expect((await getCoupon(db, 'a'))?.store?.name).toBe('Lidl');
    expect(await walletSummary(db, '2026-10-13')).toEqual({
      activeCount: 2, activeSumGrosze: 500, expiringSoonCount: 1, expiringSoonSumGrosze: 150,
    });
    expect((await listCoupons(db, 'active')).map((c) => c.id)).toEqual(['b', 'a']);
    expect((await listCoupons(db, 'redeemed'))[0]).toMatchObject({ id: 'c', redeemedAt: '2026-10-10T10:00:00.000Z' });
  });

  it('rejects negative amounts', async () => {
    await expect(insertCoupon(db, 'x', input({ amountGrosze: -1 }))).rejects.toThrow(/CHECK/i);
  });

  it('expires coupons after their last valid day', async () => {
    await insertCoupon(db, 'a', input({ expiresOn: '2026-10-09' }));
    await insertCoupon(db, 'b', input({ expiresOn: '2026-10-10' }));
    expect(await expireOverdue(db, '2026-10-10')).toBe(1);
    expect((await getCoupon(db, 'a'))?.status).toBe('expired');
    expect((await getCoupon(db, 'b'))?.status).toBe('active');
  });

  it('groups active coupons by store for geofencing', async () => {
    await insertCoupon(db, 'a', input());
    await insertCoupon(db, 'b', input({ amountGrosze: 50 }));
    await insertCoupon(db, 'c', input({ storeId: 1002, amountGrosze: 200 }));
    await setCouponStatus(db, 'c', 'redeemed');
    expect(await activeCouponStores(db)).toEqual([{ ...lidl, couponCount: 2, sumGrosze: 400 }]);
    expect(await couponsAtStore(db, 1002)).toEqual({ count: 0, sumGrosze: 0 });
  });

  it('tracks sync state: dirty flag, soft delete, remote merge', async () => {
    await insertCoupon(db, 'a', input(), '2026-10-10T10:00:00.000Z');
    expect((await dirtyCoupons(db)).map((c) => c.id)).toEqual(['a']);
    await markSynced(db, 'a', '2026-10-10T10:00:00.000Z');
    expect(await dirtyCoupons(db)).toEqual([]);

    // synced coupon -> soft delete (tombstone pushed later), unsynced -> hard delete
    await deleteCoupon(db, 'a', '2026-10-11T00:00:00.000Z');
    expect(await getCoupon(db, 'a')).toBeNull();
    expect((await dirtyCoupons(db))[0]).toMatchObject({ id: 'a', deletedAt: '2026-10-11T00:00:00.000Z' });
    await insertCoupon(db, 'b', input());
    await deleteCoupon(db, 'b');
    expect((await db.getAllAsync('select id from coupons where id = ?', 'b')).length).toBe(0);

    const remote = {
      id: 'r', amount_grosze: 700, issued_on: null, expires_on: '2026-12-01', barcode: null, barcode_type: null,
      store_id: 1001, status: 'active' as const, redeemed_at: null, note: null, photo_path: null,
      client_updated_at: '2026-10-09T00:00:00.000Z', created_at: '2026-10-09T00:00:00.000Z', deleted_at: null,
    };
    expect(await applyRemoteCoupon(db, remote)).toBe('inserted');
    expect(await applyRemoteCoupon(db, remote)).toBe('skipped');
    expect(await applyRemoteCoupon(db, { ...remote, amount_grosze: 800, client_updated_at: '2026-10-12T00:00:00.000Z' })).toBe('updated');
    expect((await getCoupon(db, 'r'))?.amountGrosze).toBe(800);
    await setCouponStatus(db, 'r', 'redeemed');
    expect(await applyRemoteCoupon(db, { ...remote, client_updated_at: '2030-01-01T00:00:00.000Z' })).toBe('skipped');
  });

  it('keeps settings with defaults and geofence state', async () => {
    expect((await getSettings(db)).radiusM).toBe(150);
    await updateSettings(db, { radiusM: 200, quietHours: { enabled: false, start: '23:00', end: '07:00' } });
    expect(await getSettings(db)).toMatchObject({ radiusM: 200, dwellSeconds: 90, quietHours: { enabled: false } });

    await saveGeofenceState(db, { ...emptyGeofenceState(1001), pendingNotificationId: 'dwell-1001' });
    expect((await getGeofenceState(db, 1001)).pendingNotificationId).toBe('dwell-1001');
    expect((await pendingOutside(db, [1002])).map((s) => s.storeId)).toEqual([1001]);
    expect(await missingStoreIds(db, [1001, 5, 5])).toEqual([5]);
  });
});
