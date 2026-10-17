/**
 * Expiry reminders end to end: wallet in real SQLite -> scheduled local notifications.
 * @jest-environment node
 */
import { createTestDb } from '../../../../tests/helpers/nodeSqlite';
import { insertCoupon, setCouponStatus } from '@/lib/db/coupons';
import { migrate } from '@/lib/db/schema';
import { updateSettings } from '@/lib/db/settings';
import type { Db } from '@/lib/db/types';
import { rescheduleExpiryReminders } from '../schedule';

let mockDb: Db;
const mockScheduled = new Map<string, { content: { title: string; body: string }; trigger: { type: string; date: Date; channelId: string } }>();

jest.mock('@/lib/db', () => ({ getDb: async () => mockDb }));
jest.mock('../setup', () => ({ CHANNEL_STORE: 'store', CHANNEL_REMINDERS: 'reminders', CATEGORY_STORE_EXIT: 'store-exit', ACTION_SCAN: 'scan', ACTION_REPORT: 'report' }));
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  scheduleNotificationAsync: async ({ identifier, content, trigger }: { identifier: string; content: never; trigger: never }) => {
    mockScheduled.set(identifier, { content, trigger });
    return identifier;
  },
  cancelScheduledNotificationAsync: async (id: string) => void mockScheduled.delete(id),
  getAllScheduledNotificationsAsync: async () => [...mockScheduled.keys()].map((identifier) => ({ identifier })),
}));

const base = { issuedOn: null, barcode: null, barcodeType: null, storeId: null, note: null, photoUri: null };
const now = new Date(2026, 9, 10, 12, 0);

describe('rescheduleExpiryReminders', () => {
  beforeEach(async () => {
    mockDb = createTestDb();
    await migrate(mockDb);
    mockScheduled.clear();
    mockScheduled.set('dwell-1001', { content: { title: 'x', body: 'y' }, trigger: { type: 'timeInterval', date: now, channelId: 'store' } });
  });

  it('schedules 3-day and 1-day reminders for active coupons and leaves other notifications alone', async () => {
    await insertCoupon(mockDb, 'a', { ...base, amountGrosze: 350, expiresOn: '2026-10-20' });
    await insertCoupon(mockDb, 'b', { ...base, amountGrosze: 100, expiresOn: null });
    expect(await rescheduleExpiryReminders(now)).toBe(2);
    expect([...mockScheduled.keys()].sort()).toEqual(['dwell-1001', 'exp-1-2026-10-20', 'exp-3-2026-10-20']);
    const three = mockScheduled.get('exp-3-2026-10-20')!;
    expect(three.trigger).toEqual({ type: 'date', date: new Date(2026, 9, 17, 10, 0), channelId: 'reminders' });
    expect(three.content.title).toBe('Kupon na 3,50 zł: termin mija za 3 dni');
  });

  it('drops reminders when the coupon is redeemed and when the user turns them off', async () => {
    await insertCoupon(mockDb, 'a', { ...base, amountGrosze: 350, expiresOn: '2026-10-20' });
    await insertCoupon(mockDb, 'c', { ...base, amountGrosze: 200, expiresOn: '2026-10-25' });
    await rescheduleExpiryReminders(now);
    await setCouponStatus(mockDb, 'a', 'redeemed');
    expect(await rescheduleExpiryReminders(now)).toBe(2);
    expect([...mockScheduled.keys()].filter((k) => k.startsWith('exp-')).sort()).toEqual(['exp-1-2026-10-25', 'exp-3-2026-10-25']);

    await updateSettings(mockDb, { expiryRemindersEnabled: false });
    expect(await rescheduleExpiryReminders(now)).toBe(0);
    expect([...mockScheduled.keys()]).toEqual(['dwell-1001']);
  });
});
