/**
 * Map data and machine reports through the app's real API layer (src/lib/api.ts)
 * against a local Supabase stack (`npm run test:integration`).
 *
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY;
const run = URL && ANON && SERVICE ? describe : describe.skip;

let mockClient: SupabaseClient<Database>;
jest.mock('@/lib/supabase/client', () => ({
  get supabase() {
    return mockClient;
  },
  requireSupabase: () => mockClient,
  BackendNotConfiguredError: class extends Error {},
}));

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

async function userClient(email: string) {
  const admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email, password: 'test-password-123', email_confirm: true });
  const c = createClient<Database>(URL!, ANON!, { auth: { storage: memoryStorage(), autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: 'test-password-123' });
  if (error) throw error;
  return c;
}

run('map and reports (local Supabase)', () => {
  const api = require('@/lib/api') as typeof import('@/lib/api');
  const admin = () => createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });

  // a random empty spot in eastern Poland so parallel/previous data does not interfere
  const base = { lat: 50.1 + Math.random() * 0.4, lon: 22.6 + Math.random() * 0.4 };
  const osmBase = 7_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
  const bbox: [number, number, number, number] = [base.lon - 0.01, base.lat - 0.01, base.lon + 0.01, base.lat + 0.01];
  const at = (northM: number, eastM = 0) => ({ lat: base.lat + northM / 111_195, lon: base.lon + eastM / 71_000 });

  beforeAll(async () => {
    const res = await admin().rpc('import_osm_region', {
      p_region: 'PL-PK',
      p_stores: [
        { osm_type: 'node', osm_id: osmBase + 1, ...at(0), name: 'Lidl Test', brand: 'Lidl', shop: 'supermarket', street: 'Testowa', housenumber: '1', city: 'Testów' },
        { osm_type: 'node', osm_id: osmBase + 2, ...at(400), name: 'Żabka Test', brand: 'Żabka', shop: 'convenience' },
      ],
      p_machines: [
        { osm_type: 'node', osm_id: osmBase + 3, ...at(10), accepts: ['pet', 'can'] },
        { osm_type: 'node', osm_id: osmBase + 4, ...at(-600), accepts: ['glass'] },
      ],
    });
    if (res.error) throw res.error;
  });

  afterAll(async () => {
    const ids = [osmBase + 1, osmBase + 2, osmBase + 3, osmBase + 4];
    await admin().from('machines').delete().in('osm_id', ids);
    await admin().from('stores').delete().in('osm_id', ids);
  });

  it('serves map points with filters to anonymous users', async () => {
    mockClient = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const none = { brands: null, accepts: null, onlyWorking: false, storeIds: null };
    const all = await api.mapPoints(bbox, none);
    expect(all.map((p) => `${p.kind}:${p.name ?? '-'}:${p.machine_count}:${p.status}`).sort()).toEqual([
      'machine:-:1:unknown',
      'store:Lidl Test:1:unknown',
      'store:Żabka Test:0:unknown',
    ]);
    expect((await api.mapPoints(bbox, { ...none, accepts: ['glass'] })).map((p) => p.kind)).toEqual(['machine']);
    expect((await api.mapPoints(bbox, { ...none, brands: ['Lidl'] })).map((p) => p.name)).toEqual(['Lidl Test']);
    expect(await api.mapPoints(bbox, { ...none, onlyWorking: true })).toEqual([]);

    const lidl = all.find((p) => p.name === 'Lidl Test')!;
    const [store] = await api.storesByIds([lidl.store_id!]);
    expect(store).toMatchObject({ name: 'Lidl Test', street: 'Testowa', machine_count: 1 });
    const near = await api.nearestStores(at(5), 300, 5);
    expect(near[0].name).toBe('Lidl Test');
    expect((await api.topBrands(50)).some((b) => b.brand === 'Lidl')).toBe(true);
  });

  it('accepts reports only from 200 m, updates the pin, takes "still?" votes', async () => {
    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    mockClient = anon;
    const lidlPoint = (await api.mapPoints(bbox, { brands: ['Lidl'], accepts: null, onlyWorking: false, storeIds: null }))[0];
    const [machine] = await api.machinesAtStore(lidlPoint.store_id!);

    mockClient = await userClient(`reporter-${Date.now()}@example.com`);
    await expect(api.reportMachine(machine.id!, 'full', at(500))).rejects.toMatchObject({
      code: 'too_far',
      message: 'Jesteś za daleko. Zgłoszenia można wysyłać do 200 m od automatu.',
    });
    const status = await api.reportMachine(machine.id!, 'full', at(30));
    expect(status).toMatchObject({ status: 'broken', report_type: 'full', confirmations: 0 });
    await expect(api.reportMachine(machine.id!, 'full', at(30))).rejects.toMatchObject({ code: 'duplicate_report' });
    await expect(api.voteReport(status.report_id!, true, at(30))).rejects.toMatchObject({ code: 'own_report' });

    mockClient = anon;
    const red = await api.mapPoints(bbox, { brands: ['Lidl'], accepts: null, onlyWorking: false, storeIds: null });
    expect(red[0].status).toBe('broken');
    expect((await api.machinesAtStore(lidlPoint.store_id!))[0]).toMatchObject({ status: 'broken', is_fresh: true, report_type: 'full' });

    mockClient = await userClient(`voter-${Date.now()}@example.com`);
    expect((await api.voteReport(status.report_id!, true, at(20))).confirmations).toBe(1);
    expect((await api.reportMachine(machine.id!, 'ok', at(20))).status).toBe('ok');

    mockClient = anon;
    expect((await api.mapPoints(bbox, { brands: null, accepts: null, onlyWorking: true, storeIds: null })).map((p) => p.name)).toEqual(['Lidl Test']);
  });

  it('adds a missing machine once two different users report it', async () => {
    const first = await userClient(`submitter-${Date.now()}@example.com`);
    mockClient = first;
    const zabka = (await api.nearestStores(at(400), 50, 1))[0];
    expect(zabka.machine_count).toBe(0);
    await expect(api.submitMissingMachine(zabka.id, at(0), [], null)).rejects.toMatchObject({ code: 'too_far' });

    const sub = await api.submitMissingMachine(zabka.id, at(405), ['pet'], null);
    expect(sub).toMatchObject({ kind: 'new_machine', status: 'pending', store_id: zabka.id });
    expect(await api.pendingMachineConfirmations(zabka.id)).toEqual({ users: 1, mine: true });
    await expect(api.submitMissingMachine(zabka.id, at(405), ['pet'], null)).rejects.toMatchObject({
      code: 'duplicate_submission',
      message: 'Już zgłosiłeś automat w tym sklepie. Pojawi się na mapie, gdy potwierdzi go druga osoba.',
    });

    mockClient = await userClient(`confirmer-${Date.now()}@example.com`);
    expect(await api.pendingMachineConfirmations(zabka.id)).toEqual({ users: 1, mine: false });
    expect((await api.submitMissingMachine(zabka.id, at(395), ['can'], null)).status).toBe('approved');

    mockClient = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const [machine] = await api.machinesAtStore(zabka.id);
    expect(machine).toMatchObject({ source: 'user', accepts: ['pet', 'can'], status: 'unknown' });
    const point = (await api.mapPoints(bbox, { brands: ['Żabka'], accepts: null, onlyWorking: false, storeIds: null }))[0];
    expect(point.machine_count).toBe(1);
    await admin().from('machines').delete().eq('id', machine.id!);
  });
});
