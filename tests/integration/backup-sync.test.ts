/**
 * Backup sync against a local Supabase stack (`npm run test:integration`).
 * Runs the real syncBackup() with SQLite provided by node:sqlite and a real
 * supabase-js client signed in as a fresh user.
 *
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';
import type { Db } from '@/lib/db/types';
import { createTestDb } from '../helpers/nodeSqlite';

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY;
const run = URL && ANON && SERVICE ? describe : describe.skip;

let mockDb: Db;
let mockClient: SupabaseClient<Database>;

jest.mock('@/lib/db', () => ({ getDb: async () => mockDb }));
jest.mock('@/lib/supabase/client', () => ({
  get supabase() {
    return mockClient;
  },
  requireSupabase: () => mockClient,
  BackendNotConfiguredError: class extends Error {},
}));
jest.mock('@/lib/photos', () => ({ readPhotoBytes: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer }));

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

async function signedInClient(email: string): Promise<SupabaseClient<Database>> {
  const admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  const client = createClient<Database>(URL!, ANON!, { auth: { storage: memoryStorage(), persistSession: true, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (error) throw error;
  return client;
}

run('backup sync (local Supabase)', () => {
  // imported lazily so the mocks above are in place
  const load = () => ({
    sync: require('@/lib/sync/backup') as typeof import('@/lib/sync/backup'),
    coupons: require('@/lib/db/coupons') as typeof import('@/lib/db/coupons'),
    schema: require('@/lib/db/schema') as typeof import('@/lib/db/schema'),
    settings: require('@/lib/db/settings') as typeof import('@/lib/db/settings'),
  });

  it('pushes, restores on a second device, propagates deletes, keeps users apart', async () => {
    const { sync, coupons, schema, settings } = load();
    const email = `sync-${Date.now()}@example.com`;
    const phoneA = createTestDb();
    const phoneB = createTestDb();
    await schema.migrate(phoneA);
    await schema.migrate(phoneB);

    // phone A: two coupons, one with a photo, then backup on
    mockDb = phoneA;
    mockClient = await signedInClient(email);
    const input = { amountGrosze: 350, issuedOn: '2026-10-05', expiresOn: '2026-11-04', barcode: '590123', barcodeType: 'ean13', storeId: null, note: null, photoUri: null };
    await coupons.insertCoupon(phoneA, '00000000-0000-4000-8000-00000000000a', { ...input, photoUri: 'file:///photo-a.jpg' });
    await coupons.insertCoupon(phoneA, '00000000-0000-4000-8000-00000000000b', { ...input, amountGrosze: 150 });
    expect(await sync.syncBackup()).toBeNull(); // backup still off: nothing leaves the phone

    const first = await sync.enableBackup();
    expect(first).toEqual({ pushed: 2, pulled: 0 });
    const { data: remote } = await mockClient.from('coupons').select('id, amount_grosze, photo_path').order('amount_grosze');
    const uid = (await mockClient.auth.getUser()).data.user!.id;
    expect(remote).toEqual([
      { id: '00000000-0000-4000-8000-00000000000b', amount_grosze: 150, photo_path: null },
      { id: '00000000-0000-4000-8000-00000000000a', amount_grosze: 350, photo_path: `${uid}/00000000-0000-4000-8000-00000000000a.jpg` },
    ]);
    expect((await coupons.dirtyCoupons(phoneA)).length).toBe(0);

    // phone B (same account): restore
    mockDb = phoneB;
    await settings.updateSettings(phoneB, { backupEnabled: true });
    expect(await sync.syncBackup()).toEqual({ pushed: 0, pulled: 2 });
    expect((await coupons.walletSummary(phoneB, '2026-10-10')).activeSumGrosze).toBe(500);

    // phone B redeems one; phone A sees it after sync
    await coupons.setCouponStatus(phoneB, '00000000-0000-4000-8000-00000000000b', 'redeemed');
    await sync.syncBackup();
    mockDb = phoneA;
    await new Promise((r) => setTimeout(r, 5)); // updated_at strictly after the cursor
    expect((await sync.syncBackup())?.pulled).toBe(1);
    expect((await coupons.getCoupon(phoneA, '00000000-0000-4000-8000-00000000000b'))?.status).toBe('redeemed');

    // phone A deletes a coupon: tombstone reaches phone B
    await coupons.deleteCoupon(phoneA, '00000000-0000-4000-8000-00000000000a');
    await sync.syncBackup();
    mockDb = phoneB;
    await sync.syncBackup();
    expect(await coupons.getCoupon(phoneB, '00000000-0000-4000-8000-00000000000a')).toBeNull();

    // another user sees nothing and cannot write into this user's photo folder
    const other = await signedInClient(`other-${Date.now()}@example.com`);
    expect((await other.from('coupons').select('id')).data).toEqual([]);
    const upload = await other.storage.from('coupon-photos').upload(`${uid}/evil.jpg`, new Uint8Array([1]), { contentType: 'image/jpeg' });
    expect(upload.error).not.toBeNull();

    // switching backup off with deletion clears the server copy
    mockDb = phoneA;
    await sync.disableBackup({ deleteRemote: true });
    expect((await mockClient.from('coupons').select('id')).data).toEqual([]);
    expect((await mockClient.storage.from('coupon-photos').list(uid)).data).toEqual([]);
  }, 30_000);
});
