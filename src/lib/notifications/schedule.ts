import * as Notifications from 'expo-notifications';

import { activeCouponsForReminders } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { getSettings } from '@/lib/db/settings';

import { EXPIRY_PREFIX, planExpiryReminders } from './expiry';
import { ACTION_REPORT, ACTION_SCAN, CATEGORY_STORE_EXIT, CHANNEL_REMINDERS, CHANNEL_STORE } from './setup';

export type NotificationData = { url?: string; storeId?: number; machineId?: number | null };

export function dwellNotificationId(storeId: number): string {
  return `dwell-${storeId}`;
}

export async function scheduleDwellNotification(storeId: number, seconds: number, title: string, body: string): Promise<string> {
  const data: NotificationData = { url: `/?store=${storeId}`, storeId };
  return Notifications.scheduleNotificationAsync({
    identifier: dwellNotificationId(storeId),
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_STORE },
  });
}

export async function cancelNotification(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function presentExitPrompt(storeId: number, machineId: number | null, title: string, body: string): Promise<void> {
  const data: NotificationData = { url: machineId ? `/report?machineId=${machineId}` : `/coupon/new?storeId=${storeId}`, storeId, machineId };
  await Notifications.scheduleNotificationAsync({
    identifier: `exit-${storeId}`,
    content: { title, body, data, categoryIdentifier: CATEGORY_STORE_EXIT },
    trigger: { channelId: CHANNEL_STORE },
  });
}

/** Re-plans all expiry reminders from the wallet (cheap; called after every change). */
export async function rescheduleExpiryReminders(now = new Date()): Promise<number> {
  const db = await getDb();
  const settings = await getSettings(db);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(EXPIRY_PREFIX)).map((n) => cancelNotification(n.identifier)),
  );
  if (!settings.expiryRemindersEnabled) return 0;

  const plan = planExpiryReminders(await activeCouponsForReminders(db), now);
  await Promise.all(
    plan.map((r) =>
      Notifications.scheduleNotificationAsync({
        identifier: r.identifier,
        content: { title: r.title, body: r.body, data: { url: '/' } satisfies NotificationData },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CHANNEL_REMINDERS },
      }),
    ),
  );
  return plan.length;
}

/** Where a tapped notification (or one of its action buttons) should take the user. */
export function hrefForResponse(response: Notifications.NotificationResponse): string | null {
  const data = (response.notification.request.content.data ?? {}) as NotificationData;
  if (response.actionIdentifier === ACTION_SCAN) return data.storeId ? `/coupon/new?storeId=${data.storeId}` : '/coupon/new';
  if (response.actionIdentifier === ACTION_REPORT && data.machineId) return `/report?machineId=${data.machineId}`;
  return typeof data.url === 'string' ? data.url : null;
}
