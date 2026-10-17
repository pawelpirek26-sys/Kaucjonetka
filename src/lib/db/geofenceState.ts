import type { Db } from './types';

export type GeofenceState = {
  storeId: number;
  enteredAt: string | null;
  pendingNotificationId: string | null;
  lastNotifiedAt: string | null;
  prevNotifiedAt: string | null;
  lastExitPromptAt: string | null;
};

type Row = {
  store_id: number;
  entered_at: string | null;
  pending_notification_id: string | null;
  last_notified_at: string | null;
  prev_notified_at: string | null;
  last_exit_prompt_at: string | null;
};

export function emptyGeofenceState(storeId: number): GeofenceState {
  return {
    storeId,
    enteredAt: null,
    pendingNotificationId: null,
    lastNotifiedAt: null,
    prevNotifiedAt: null,
    lastExitPromptAt: null,
  };
}

export async function getGeofenceState(db: Db, storeId: number): Promise<GeofenceState> {
  const r = await db.getFirstAsync<Row>('select * from geofence_state where store_id = ?', storeId);
  if (!r) return emptyGeofenceState(storeId);
  return {
    storeId: r.store_id,
    enteredAt: r.entered_at,
    pendingNotificationId: r.pending_notification_id,
    lastNotifiedAt: r.last_notified_at,
    prevNotifiedAt: r.prev_notified_at,
    lastExitPromptAt: r.last_exit_prompt_at,
  };
}

export async function saveGeofenceState(db: Db, s: GeofenceState): Promise<void> {
  await db.runAsync(
    `insert into geofence_state (store_id, entered_at, pending_notification_id, last_notified_at, prev_notified_at, last_exit_prompt_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict (store_id) do update set
       entered_at = excluded.entered_at, pending_notification_id = excluded.pending_notification_id,
       last_notified_at = excluded.last_notified_at, prev_notified_at = excluded.prev_notified_at,
       last_exit_prompt_at = excluded.last_exit_prompt_at`,
    s.storeId, s.enteredAt, s.pendingNotificationId, s.lastNotifiedAt, s.prevNotifiedAt, s.lastExitPromptAt,
  );
}

/** Pending dwell notifications of stores that are no longer monitored. */
export async function pendingOutside(db: Db, monitoredIds: number[]): Promise<GeofenceState[]> {
  const rows = await db.getAllAsync<Row>('select * from geofence_state where pending_notification_id is not null');
  return rows
    .filter((r) => !monitoredIds.includes(r.store_id))
    .map((r) => ({
      storeId: r.store_id,
      enteredAt: r.entered_at,
      pendingNotificationId: r.pending_notification_id,
      lastNotifiedAt: r.last_notified_at,
      prevNotifiedAt: r.prev_notified_at,
      lastExitPromptAt: r.last_exit_prompt_at,
    }));
}
