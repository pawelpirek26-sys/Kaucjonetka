import * as Location from 'expo-location';

import type { LatLon } from '@/lib/geo';

export class LocationUnavailableError extends Error {
  constructor(reason: 'permission' | 'unavailable') {
    super(reason);
  }
}

export async function ensureForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/**
 * Current position for foreground features. `precise` is used for reports (must prove
 * the user stands next to the machine); otherwise a recent cached fix is good enough.
 */
export async function getPosition({ precise = false } = {}): Promise<LatLon> {
  if (!(await ensureForegroundPermission())) throw new LocationUnavailableError('permission');
  if (!precise) {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 });
    if (last) return { lat: last.coords.latitude, lon: last.coords.longitude };
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    throw new LocationUnavailableError('unavailable');
  }
}
