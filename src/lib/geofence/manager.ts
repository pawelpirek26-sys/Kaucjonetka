// Keeps the OS geofences in sync with the wallet and handles their events.
// Background location is strictly opt-in: nothing here runs unless the user enabled
// "przypomnienia przy sklepie" and granted "Always" location access.
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { activeCouponStores, couponsAtStore } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { getGeofenceState, pendingOutside, saveGeofenceState } from '@/lib/db/geofenceState';
import { getSettings, updateSettings } from '@/lib/db/settings';
import { getStore, storeLabel } from '@/lib/db/stores';
import type { LatLon } from '@/lib/geo';
import { cancelNotification, presentExitPrompt, scheduleDwellNotification } from '@/lib/notifications/schedule';

import { maxStoreRegions, parseStoreRegionId, planGeofences, REFRESH_REGION_ID } from './plan';
import { decideOnEnter, decideOnExit, stateAfterEnter, stateAfterExit } from './policy';

export const GEOFENCE_TASK = 'kaucjomat-geofence';

export type GeofenceStatus =
  | { state: 'disabled' }
  | { state: 'no_permission' }
  | { state: 'idle' } // enabled, but no stores with active coupons
  | { state: 'monitoring'; storeCount: number; refreshRadiusM: number | null };

// Geofence events and refreshes touch the same rows; run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

export async function hasBackgroundPermission(): Promise<boolean> {
  const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
  return fg.granted && bg.granted;
}

async function stopMonitoring(): Promise<void> {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}

async function currentPosition(): Promise<LatLon | null> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
}

/** Re-plans the monitored regions (20 nearest stores with active coupons + refresh region). */
export function refreshGeofences(position?: LatLon): Promise<GeofenceStatus> {
  return serial(async () => {
    const db = await getDb();
    const settings = await getSettings(db);
    if (!settings.geofencingEnabled) {
      await stopMonitoring();
      return { state: 'disabled' };
    }
    if (!(await hasBackgroundPermission())) {
      // permission revoked in system settings: switch the feature off instead of failing silently
      await stopMonitoring();
      await updateSettings(db, { geofencingEnabled: false });
      return { state: 'no_permission' };
    }

    const candidates = await activeCouponStores(db);
    const plan = planGeofences(position ?? (await currentPosition()), candidates, {
      maxStores: maxStoreRegions(Platform.OS),
      radiusM: settings.radiusM,
    });

    for (const stale of await pendingOutside(db, plan.storeIds)) {
      await cancelNotification(stale.pendingNotificationId!);
      await saveGeofenceState(db, { ...stale, pendingNotificationId: null, enteredAt: null, lastNotifiedAt: stale.prevNotifiedAt });
    }

    if (plan.regions.length === 0) {
      await stopMonitoring();
      return { state: 'idle' };
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK, plan.regions);
    return { state: 'monitoring', storeCount: plan.storeIds.length, refreshRadiusM: plan.refreshRadiusM };
  });
}

export async function disableGeofencing(): Promise<void> {
  const db = await getDb();
  await updateSettings(db, { geofencingEnabled: false });
  await refreshGeofences();
}

async function onEnter(storeId: number, now: Date): Promise<void> {
  const db = await getDb();
  const [settings, store, coupons, state] = await Promise.all([
    getSettings(db),
    getStore(db, storeId),
    couponsAtStore(db, storeId),
    getGeofenceState(db, storeId),
  ]);
  if (!store) return;
  const decision = decideOnEnter({ now, state, settings, coupons, storeName: storeLabel(store) });
  let notificationId: string | null = null;
  if (decision.action === 'schedule') {
    notificationId = await scheduleDwellNotification(storeId, decision.fireInSeconds, decision.title, decision.body);
  }
  await saveGeofenceState(db, stateAfterEnter(state, decision, now, notificationId));
}

async function onExit(storeId: number, now: Date): Promise<void> {
  const db = await getDb();
  const [settings, store, state] = await Promise.all([getSettings(db), getStore(db, storeId), getGeofenceState(db, storeId)]);
  if (!store) return;
  const decision = decideOnExit({ now, state, settings, store: { name: storeLabel(store), machineCount: store.machineCount } });
  if (decision.cancelNotificationId) await cancelNotification(decision.cancelNotificationId);
  if (decision.prompt) await presentExitPrompt(storeId, store.machineId, decision.prompt.title, decision.prompt.body);
  await saveGeofenceState(db, stateAfterExit(state, decision, now));
}

export async function handleGeofenceEvent(eventType: Location.LocationGeofencingEventType, region: Location.LocationRegion): Promise<void> {
  if (region.identifier === REFRESH_REGION_ID) {
    if (eventType === Location.LocationGeofencingEventType.Exit) await refreshGeofences();
    return;
  }
  const storeId = parseStoreRegionId(region.identifier);
  if (storeId === null) return;
  const now = new Date();
  await serial(() =>
    eventType === Location.LocationGeofencingEventType.Enter ? onEnter(storeId, now) : onExit(storeId, now),
  );
}

