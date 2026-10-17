import type { StoreWithCoupons } from '@/lib/db/coupons';
import { emptyGeofenceState } from '@/lib/db/geofenceState';
import { DEFAULT_SETTINGS } from '@/lib/db/settings';
import { maxStoreRegions, parseStoreRegionId, planGeofences, REFRESH_REGION_ID } from '@/lib/geofence/plan';
import { decideOnEnter, decideOnExit, isQuietTime, stateAfterEnter, stateAfterExit } from '@/lib/geofence/policy';

const home = { lat: 52.2297, lon: 21.0122 };

function store(id: number, northMeters: number): StoreWithCoupons {
  return {
    id, name: `Sklep ${id}`, brand: null, lat: home.lat + northMeters / 111_195, lon: home.lon,
    street: null, housenumber: null, city: null, machineCount: id % 2, machineId: null, couponCount: 1, sumGrosze: 50,
  };
}

describe('planGeofences', () => {
  it('monitors the nearest stores with the configured radius and no refresh region when all fit', () => {
    const plan = planGeofences(home, [store(1, 900), store(2, 100)], { maxStores: 20, radiusM: 150 });
    expect(plan.storeIds).toEqual([2, 1]);
    expect(plan.regions.every((r) => r.radius === 150 && r.notifyOnEnter && r.notifyOnExit)).toBe(true);
    expect(plan.refreshRadiusM).toBeNull();
  });

  it('caps at 20 stores (19 on iOS) and adds a refresh region around the user', () => {
    const many = Array.from({ length: 30 }, (_, i) => store(i + 1, (i + 1) * 300));
    const android = planGeofences(home, many, { maxStores: maxStoreRegions('android'), radiusM: 150 });
    expect(android.storeIds).toHaveLength(20);
    expect(android.regions).toHaveLength(21);
    const refresh = android.regions.find((r) => r.identifier === REFRESH_REGION_ID)!;
    expect(refresh).toMatchObject({ latitude: home.lat, longitude: home.lon, notifyOnEnter: false, notifyOnExit: true });
    // farthest monitored store is 6 km away -> half of it, capped at 5 km
    expect(refresh.radius).toBe(3000);

    const ios = planGeofences(home, many, { maxStores: maxStoreRegions('ios'), radiusM: 150 });
    expect(ios.regions).toHaveLength(20);
  });

  it('round-trips region identifiers', () => {
    expect(parseStoreRegionId('store:1001')).toBe(1001);
    expect(parseStoreRegionId(REFRESH_REGION_ID)).toBeNull();
  });
});

describe('quiet hours', () => {
  const q = { enabled: true, start: '22:00', end: '08:00' };
  it.each([
    ['21:59', false],
    ['22:00', true],
    ['03:00', true],
    ['07:59', true],
    ['08:00', false],
  ])('%s -> %s', (hhmm, quiet) => {
    const [h, m] = hhmm.split(':').map(Number);
    expect(isQuietTime(new Date(2026, 9, 10, h, m), q)).toBe(quiet);
  });
  it('can be disabled', () => expect(isQuietTime(new Date(2026, 9, 10, 23, 0), { ...q, enabled: false })).toBe(false));
});

describe('enter/exit policy', () => {
  const settings = { dwellSeconds: 90, quietHours: DEFAULT_SETTINGS.quietHours };
  const noon = new Date(2026, 9, 10, 12, 0, 0);
  const coupons = { count: 3, sumGrosze: 750 };

  it('schedules a dwell notification with count and sum', () => {
    const d = decideOnEnter({ now: noon, state: emptyGeofenceState(1), settings, coupons, storeName: 'Lidl' });
    expect(d).toEqual({
      action: 'schedule',
      fireInSeconds: 90,
      title: 'Lidl: masz 3 kupony',
      body: 'Razem 7,50 zł do odebrania przy kasie. Stuknij, żeby pokazać kupony.',
    });
  });

  it('skips without coupons, during quiet hours and within the 12 h cooldown', () => {
    const base = { state: emptyGeofenceState(1), settings, storeName: 'Lidl' };
    expect(decideOnEnter({ ...base, now: noon, coupons: { count: 0, sumGrosze: 0 } })).toMatchObject({ reason: 'no_coupons' });
    expect(decideOnEnter({ ...base, now: new Date(2026, 9, 10, 21, 59, 0), coupons })).toMatchObject({ reason: 'quiet_hours' });
    const notified = { ...base.state, lastNotifiedAt: new Date(noon.getTime() - 11 * 3600_000).toISOString() };
    expect(decideOnEnter({ ...base, state: notified, now: noon, coupons })).toMatchObject({ reason: 'cooldown' });
    const longAgo = { ...base.state, lastNotifiedAt: new Date(noon.getTime() - 13 * 3600_000).toISOString() };
    expect(decideOnEnter({ ...base, state: longAgo, now: noon, coupons }).action).toBe('schedule');
  });

  it('walking past: early exit cancels the notification and restores the cooldown', () => {
    const before = { ...emptyGeofenceState(1), lastNotifiedAt: '2026-10-01T10:00:00.000Z' };
    const enter = decideOnEnter({ now: noon, state: before, settings, coupons, storeName: 'Lidl' });
    const inside = stateAfterEnter(before, enter, noon, 'dwell-1');
    expect(inside.pendingNotificationId).toBe('dwell-1');

    const exitAt = new Date(noon.getTime() + 40_000);
    const exit = decideOnExit({ now: exitAt, state: inside, settings, store: { name: 'Lidl', machineCount: 1 } });
    expect(exit).toEqual({ cancelNotificationId: 'dwell-1', prompt: null });
    expect(stateAfterExit(inside, exit, exitAt).lastNotifiedAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('real visit: notification stays, exit from a store with a machine prompts once per 12 h', () => {
    const inside = stateAfterEnter(emptyGeofenceState(1), decideOnEnter({ now: noon, state: emptyGeofenceState(1), settings, coupons, storeName: 'Lidl' }), noon, 'dwell-1');
    const exitAt = new Date(noon.getTime() + 10 * 60_000);
    const exit = decideOnExit({ now: exitAt, state: inside, settings, store: { name: 'Lidl', machineCount: 1 } });
    expect(exit.cancelNotificationId).toBeNull();
    expect(exit.prompt?.title).toBe('Oddałeś opakowania w Lidl?');
    const after = stateAfterExit(inside, exit, exitAt);
    expect(after.lastExitPromptAt).toBe(exitAt.toISOString());

    const again = stateAfterEnter(after, { action: 'skip', reason: 'cooldown' }, new Date(exitAt.getTime() + 3600_000), null);
    const secondExit = decideOnExit({ now: new Date(exitAt.getTime() + 2 * 3600_000), state: again, settings, store: { name: 'Lidl', machineCount: 1 } });
    expect(secondExit.prompt).toBeNull();
  });

  it('no exit prompt for stores without a machine', () => {
    const inside = { ...emptyGeofenceState(1), enteredAt: noon.toISOString() };
    const exit = decideOnExit({ now: new Date(noon.getTime() + 600_000), state: inside, settings, store: { name: 'Żabka', machineCount: 0 } });
    expect(exit.prompt).toBeNull();
  });
});
