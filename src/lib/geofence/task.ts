// Must be imported at app start (root layout) so the OS can wake the JS runtime for
// geofence events even when the app is in the background or was killed.
import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { GEOFENCE_TASK, handleGeofenceEvent } from './manager';

type GeofenceTaskData = {
  eventType: Location.LocationGeofencingEventType;
  region: Location.LocationRegion;
};

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_TASK, async ({ data, error }) => {
    if (error || !data) {
      console.warn('[geofence]', error?.message ?? 'no data');
      return;
    }
    try {
      await handleGeofenceEvent(data.eventType, data.region);
    } catch (e) {
      console.warn('[geofence] handler failed', e);
    }
  });
}
