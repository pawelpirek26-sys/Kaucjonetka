/**
 * Geofence flow with real SQLite + real policy; only the native modules are mocked.
 * @jest-environment node
 */
import { Platform } from 'react-native';

import { createTestDb } from '../../../../tests/helpers/nodeSqlite';
import type { Db } from '@/lib/db/types';

let mockDb: Db;
const mockLocation = {
  fg: true,
  bg: true,
  started: false,
  regions: [] as { identifier: string; radius: number }[],
  position: { coords: { latitude: 52.2297, longitude: 21.0122 } },
};
const mockScheduled: { identifier: string; content: { title: string; body: string; categoryIdentifier?: string }; trigger: unknown }[] = [];

jest.mock('@/lib/db', () => ({ getDb: async () => mockDb }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  LocationGeofencingEventType: { Enter: 1, Exit: 2 },
  getForegroundPermissionsAsync: async () => ({ granted: mockLocation.fg }),
  getBackgroundPermissionsAsync: async () => ({ granted: mockLocation.bg }),
  hasStartedGeofencingAsync: async () => mockLocation.started,
  startGeofencingAsync: async (_task: string, regions: { identifier: string; radius: number }[]) => {
    mockLocation.started = true;
    mockLocation.regions = regions;
  },
  stopGeofencingAsync: async () => {
    mockLocation.started = false;
    mockLocation.regions = [];
  },
  getLastKnownPositionAsync: async () => mockLocation.position,
  getCurrentPositionAsync: async () => mockLocation.position,
}));
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  scheduleNotificationAsync: async (req: (typeof mockScheduled)[number]) => {
    mockScheduled.push(req);
    return req.identifier;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    const i = mockScheduled.findIndex((n) => n.identifier === id);
    if (i >= 0) mockScheduled.splice(i, 1);
  },
  getAllScheduledNotificationsAsync: async () => mockScheduled,
}));
jest.mock('@/lib/notifications/setup', () => ({ CHANNEL_STORE: 'store', CHANNEL_REMINDERS: 'reminders', CATEGORY_STORE_EXIT: 'store-exit', ACTION_SCAN: 'scan', ACTION_REPORT: 'report' }));

import { insertCoupon } from '@/lib/db/coupons';
import { migrate } from '@/lib/db/schema';
import { updateSettings, getSettings } from '@/lib/db/settings';
import { upsertStore } from '@/lib/db/stores';
import { handleGeofenceEvent, refreshGeofences } from '../manager';

const ENTER = 1;
const EXIT = 2;
const lidl = { id: 1001, name: 'Lidl', brand: 'Lidl', lat: 52.2297, lon: 21.0122, street: null, housenumber: null, city: null, machineCount: 1, machineId: 2001 };
const coupon = { issuedOn: null, expiresOn: null, barcode: null, barcodeType: null, note: null, photoUri: null };
const region = (id: string) => ({ identifier: id, latitude: 0, longitude: 0, radius: 150 });

describe('geofence manager', () => {
  beforeEach(async () => {
    mockDb = createTestDb();
    await migrate(mockDb);
    mockScheduled.length = 0;
    Object.assign(mockLocation, { fg: true, bg: true, started: false, regions: [] });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  it('does nothing until the user opts in', async () => {
    expect(await refreshGeofences()).toEqual({ state: 'disabled' });
    expect(mockLocation.started).toBe(false);
  });

  it('monitors only stores with active coupons, nearest first, plus a refresh region', async () => {
    await updateSettings(mockDb, { geofencingEnabled: true, radiusM: 200 });
    expect(await refreshGeofences()).toEqual({ state: 'idle' });

    for (let i = 0; i < 25; i++) {
      const store = { ...lidl, id: 3000 + i, lat: lidl.lat + (i + 1) * 0.003 };
      await upsertStore(mockDb, store);
      await insertCoupon(mockDb, `c${i}`, { ...coupon, amountGrosze: 50, storeId: store.id });
    }
    const status = await refreshGeofences();
    const max = Platform.OS === 'ios' ? 19 : 20;
    expect(status).toMatchObject({ state: 'monitoring', storeCount: max });
    expect(mockLocation.regions).toHaveLength(max + 1);
    expect(mockLocation.regions[0]).toMatchObject({ identifier: 'store:3000', radius: 200 });
    expect(mockLocation.regions.at(-1)?.identifier).toBe('refresh');
  });

  it('turns itself off when background permission was revoked', async () => {
    await updateSettings(mockDb, { geofencingEnabled: true });
    mockLocation.bg = false;
    expect(await refreshGeofences()).toEqual({ state: 'no_permission' });
    expect((await getSettings(mockDb)).geofencingEnabled).toBe(false);
  });

  describe('events', () => {
    beforeEach(async () => {
      await updateSettings(mockDb, { geofencingEnabled: true, dwellSeconds: 90 });
      await upsertStore(mockDb, lidl);
      await insertCoupon(mockDb, 'a', { ...coupon, amountGrosze: 350, storeId: 1001 });
      await insertCoupon(mockDb, 'b', { ...coupon, amountGrosze: 400, storeId: 1001 });
    });

    it('enter schedules the dwell notification with count and sum', async () => {
      await handleGeofenceEvent(ENTER, region('store:1001'));
      expect(mockScheduled).toEqual([
        {
          identifier: 'dwell-1001',
          content: { title: 'Lidl: masz 2 kupony', body: 'Razem 7,50 zł do odebrania przy kasie. Stuknij, żeby pokazać kupony.', data: { url: '/?store=1001', storeId: 1001 } },
          trigger: { type: 'timeInterval', seconds: 90, channelId: 'store' },
        },
      ]);
    });

    it('walking past (exit before dwell) cancels it and allows a later visit', async () => {
      await handleGeofenceEvent(ENTER, region('store:1001'));
      jest.advanceTimersByTime(30_000);
      await handleGeofenceEvent(EXIT, region('store:1001'));
      expect(mockScheduled).toEqual([]);

      jest.advanceTimersByTime(10 * 60_000);
      await handleGeofenceEvent(ENTER, region('store:1001'));
      expect(mockScheduled.map((n) => n.identifier)).toEqual(['dwell-1001']);
    });

    it('real visit: exit from a store with a machine asks to scan / rate, then 12 h cooldown', async () => {
      await handleGeofenceEvent(ENTER, region('store:1001'));
      jest.advanceTimersByTime(8 * 60_000);
      await handleGeofenceEvent(EXIT, region('store:1001'));
      const exit = mockScheduled.find((n) => n.identifier === 'exit-1001')!;
      expect(exit.content).toMatchObject({ title: 'Oddałeś opakowania w Lidl?', categoryIdentifier: 'store-exit' });

      mockScheduled.length = 0;
      jest.advanceTimersByTime(2 * 3600_000);
      await handleGeofenceEvent(ENTER, region('store:1001'));
      jest.advanceTimersByTime(5 * 60_000);
      await handleGeofenceEvent(EXIT, region('store:1001'));
      expect(mockScheduled).toEqual([]); // within 12 h: no second reminder, no second prompt
    });

    it('respects quiet hours', async () => {
      jest.setSystemTime(new Date(2026, 9, 10, 22, 30, 0));
      await handleGeofenceEvent(ENTER, region('store:1001'));
      expect(mockScheduled).toEqual([]);
    });

    it('leaving the refresh region re-plans the monitored stores', async () => {
      await handleGeofenceEvent(EXIT, region('refresh'));
      expect(mockLocation.regions.map((r) => r.identifier)).toEqual(['store:1001']);
    });
  });
});

describe('notification actions', () => {
  const { hrefForResponse } = require('@/lib/notifications/schedule') as typeof import('@/lib/notifications/schedule');
  const response = (actionIdentifier: string, data: object) =>
    ({ actionIdentifier, notification: { request: { content: { data } } } }) as unknown as Parameters<typeof hrefForResponse>[0];

  it('routes the exit prompt buttons and taps', () => {
    const data = { url: '/report?machineId=2001', storeId: 1001, machineId: 2001 };
    expect(hrefForResponse(response('scan', data))).toBe('/coupon/new?storeId=1001');
    expect(hrefForResponse(response('report', data))).toBe('/report?machineId=2001');
    expect(hrefForResponse(response('expo.modules.notifications.actions.DEFAULT', data))).toBe('/report?machineId=2001');
    expect(hrefForResponse(response('expo.modules.notifications.actions.DEFAULT', { url: '/?store=1001' }))).toBe('/?store=1001');
  });
});
