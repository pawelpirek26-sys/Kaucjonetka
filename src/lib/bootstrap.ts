// What runs when the app comes to the foreground and after every wallet change.
import { expireOverdue } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { toISODate } from '@/lib/dates';
import { emitWalletChanged } from '@/lib/events';
import { refreshGeofences } from '@/lib/geofence/manager';
import { rescheduleExpiryReminders } from '@/lib/notifications/schedule';
import { configureNotifications } from '@/lib/notifications/setup';
import { syncBackup } from '@/lib/sync/backup';

function logError(scope: string) {
  return (e: unknown) => console.warn(`[${scope}]`, e);
}

export async function onAppActive(): Promise<void> {
  await configureNotifications().catch(logError('notifications'));
  const db = await getDb();
  if ((await expireOverdue(db, toISODate(new Date()))) > 0) emitWalletChanged();
  await Promise.all([
    rescheduleExpiryReminders().catch(logError('reminders')),
    refreshGeofences().catch(logError('geofence')),
  ]);
  syncBackup().catch(logError('backup'));
}

/** Call after inserting/updating/deleting coupons or changing their status. */
export async function afterWalletChange(): Promise<void> {
  emitWalletChanged();
  await Promise.all([
    rescheduleExpiryReminders().catch(logError('reminders')),
    refreshGeofences().catch(logError('geofence')),
  ]);
  syncBackup().catch(logError('backup'));
}
