// Which regions to hand to the OS. iOS monitors at most 20 regions per app, so on iOS
// 19 stores + 1 "refresh" region are used; Android gets 20 stores + 1 refresh region.
// Leaving the refresh region (centred on the position used for planning) triggers a
// re-plan in the background, which is how the list follows significant moves without
// continuous location updates.
import type { StoreWithCoupons } from '@/lib/db/coupons';
import { distanceMeters, type LatLon } from '@/lib/geo';

export const STORE_REGION_PREFIX = 'store:';
export const REFRESH_REGION_ID = 'refresh';
const REFRESH_MIN_M = 750;
const REFRESH_MAX_M = 5000;

export type GeofenceRegion = {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
};

export type GeofencePlan = {
  regions: GeofenceRegion[];
  storeIds: number[];
  refreshRadiusM: number | null;
};

export function maxStoreRegions(platform: string): number {
  return platform === 'ios' ? 19 : 20;
}

export function storeRegionId(storeId: number): string {
  return `${STORE_REGION_PREFIX}${storeId}`;
}

export function parseStoreRegionId(identifier: string | undefined): number | null {
  if (!identifier?.startsWith(STORE_REGION_PREFIX)) return null;
  const id = Number(identifier.slice(STORE_REGION_PREFIX.length));
  return Number.isSafeInteger(id) ? id : null;
}

export function planGeofences(
  position: LatLon | null,
  candidates: StoreWithCoupons[],
  opts: { maxStores: number; radiusM: number },
): GeofencePlan {
  const ranked = candidates
    .map((s) => ({ store: s, distance: position ? distanceMeters(position, s) : 0 }))
    .sort((a, b) => a.distance - b.distance || a.store.id - b.store.id);
  const chosen = ranked.slice(0, opts.maxStores);

  const regions: GeofenceRegion[] = chosen.map(({ store }) => ({
    identifier: storeRegionId(store.id),
    latitude: store.lat,
    longitude: store.lon,
    radius: opts.radiusM,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  let refreshRadiusM: number | null = null;
  if (position && ranked.length > opts.maxStores) {
    const farthest = chosen[chosen.length - 1].distance;
    refreshRadiusM = Math.round(Math.min(REFRESH_MAX_M, Math.max(REFRESH_MIN_M, farthest / 2, opts.radiusM * 2)));
    regions.push({
      identifier: REFRESH_REGION_ID,
      latitude: position.lat,
      longitude: position.lon,
      radius: refreshRadiusM,
      notifyOnEnter: false,
      notifyOnExit: true,
    });
  }

  return { regions, storeIds: chosen.map(({ store }) => store.id), refreshRadiusM };
}
