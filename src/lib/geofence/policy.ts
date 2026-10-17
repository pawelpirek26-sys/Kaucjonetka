// Pure decisions for geofence events. Dwell is implemented by scheduling the "you have
// coupons here" notification `dwellSeconds` after entering and cancelling it on an early
// exit, so walking past a store never notifies.
import type { GeofenceState } from '@/lib/db/geofenceState';
import type { QuietHours, Settings } from '@/lib/db/settings';
import { countCoupons } from '@/lib/i18n';
import { formatGrosze } from '@/lib/money';

export const COOLDOWN_MS = 12 * 60 * 60 * 1000;

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isQuietTime(at: Date, q: QuietHours): boolean {
  if (!q.enabled) return false;
  const start = minutesOfDay(q.start);
  const end = minutesOfDay(q.end);
  if (start === end) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

export type EnterDecision =
  | { action: 'schedule'; fireInSeconds: number; title: string; body: string }
  | { action: 'skip'; reason: 'no_coupons' | 'already_pending' | 'cooldown' | 'quiet_hours' };

export function decideOnEnter(args: {
  now: Date;
  state: GeofenceState;
  settings: Pick<Settings, 'dwellSeconds' | 'quietHours'>;
  coupons: { count: number; sumGrosze: number };
  storeName: string;
}): EnterDecision {
  const { now, state, settings, coupons, storeName } = args;
  const t = now.getTime();
  if (coupons.count === 0) return { action: 'skip', reason: 'no_coupons' };

  const entered = ms(state.enteredAt);
  if (state.pendingNotificationId && entered !== null && t - entered < settings.dwellSeconds * 1000) {
    return { action: 'skip', reason: 'already_pending' };
  }
  const last = ms(state.lastNotifiedAt);
  if (last !== null && t - last < COOLDOWN_MS) return { action: 'skip', reason: 'cooldown' };

  const fireAt = new Date(t + settings.dwellSeconds * 1000);
  if (isQuietTime(fireAt, settings.quietHours)) return { action: 'skip', reason: 'quiet_hours' };

  return {
    action: 'schedule',
    fireInSeconds: settings.dwellSeconds,
    title: `${storeName}: masz ${countCoupons(coupons.count)}`,
    body: `Razem ${formatGrosze(coupons.sumGrosze)} do odebrania przy kasie. Stuknij, żeby pokazać kupony.`,
  };
}

export function stateAfterEnter(state: GeofenceState, decision: EnterDecision, now: Date, notificationId: string | null): GeofenceState {
  const base = { ...state, enteredAt: now.toISOString() };
  if (decision.action !== 'schedule' || !notificationId) {
    return decision.action === 'skip' && decision.reason === 'already_pending' ? state : { ...base, pendingNotificationId: null };
  }
  return {
    ...base,
    pendingNotificationId: notificationId,
    prevNotifiedAt: state.lastNotifiedAt,
    // counts as notified when it fires; restored on an early exit
    lastNotifiedAt: new Date(now.getTime() + decision.fireInSeconds * 1000).toISOString(),
  };
}

export type ExitDecision = {
  cancelNotificationId: string | null;
  prompt: { title: string; body: string } | null;
};

export function decideOnExit(args: {
  now: Date;
  state: GeofenceState;
  settings: Pick<Settings, 'dwellSeconds' | 'quietHours'>;
  store: { name: string; machineCount: number };
}): ExitDecision {
  const { now, state, settings, store } = args;
  const t = now.getTime();
  const entered = ms(state.enteredAt);
  const dwelled = entered !== null && t - entered >= settings.dwellSeconds * 1000;

  const cancelNotificationId = state.pendingNotificationId && !dwelled ? state.pendingNotificationId : null;

  const lastPrompt = ms(state.lastExitPromptAt);
  const canPrompt =
    dwelled &&
    store.machineCount > 0 &&
    !isQuietTime(now, settings.quietHours) &&
    (lastPrompt === null || t - lastPrompt >= COOLDOWN_MS);

  return {
    cancelNotificationId,
    prompt: canPrompt
      ? { title: `Oddałeś opakowania w ${store.name}?`, body: 'Zeskanuj kupon albo daj znać, jak działał automat.' }
      : null,
  };
}

export function stateAfterExit(state: GeofenceState, decision: ExitDecision, now: Date): GeofenceState {
  return {
    ...state,
    enteredAt: null,
    pendingNotificationId: null,
    lastNotifiedAt: decision.cancelNotificationId ? state.prevNotifiedAt : state.lastNotifiedAt,
    lastExitPromptAt: decision.prompt ? now.toISOString() : state.lastExitPromptAt,
  };
}
