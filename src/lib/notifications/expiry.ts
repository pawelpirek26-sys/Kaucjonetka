// Plans local reminders 3 days and 1 day before a coupon's last valid day (at 10:00).
// Coupons expiring on the same day share one notification, which also keeps us far
// below iOS's limit of 64 scheduled local notifications.
import type { Coupon } from '@/lib/db/coupons';
import { storeLabel } from '@/lib/db/stores';
import { addDays, formatPlDate, fromISODate } from '@/lib/dates';
import { countCoupons } from '@/lib/i18n';
import { formatGrosze } from '@/lib/money';

export const EXPIRY_PREFIX = 'exp-';
export const REMINDER_DAYS_BEFORE = [3, 1] as const;

export type ExpiryReminder = {
  identifier: string;
  date: Date;
  title: string;
  body: string;
  couponIds: string[];
};

type ReminderCoupon = Pick<Coupon, 'id' | 'amountGrosze' | 'expiresOn' | 'store'>;

export function planExpiryReminders(coupons: ReminderCoupon[], now: Date, { hour = 10, max = 40 } = {}): ExpiryReminder[] {
  const byDay = new Map<string, ReminderCoupon[]>();
  for (const c of coupons) {
    if (!c.expiresOn) continue;
    byDay.set(c.expiresOn, [...(byDay.get(c.expiresOn) ?? []), c]);
  }

  const out: ExpiryReminder[] = [];
  for (const [expiresOn, group] of byDay) {
    for (const daysBefore of REMINDER_DAYS_BEFORE) {
      const date = fromISODate(addDays(expiresOn, -daysBefore));
      date.setHours(hour, 0, 0, 0);
      if (date.getTime() <= now.getTime()) continue;

      const sum = group.reduce((acc, c) => acc + c.amountGrosze, 0);
      const stores = [...new Set(group.map((c) => (c.store ? storeLabel(c.store) : null)).filter(Boolean))];
      const what = group.length === 1 ? `Kupon na ${formatGrosze(sum)}` : `${countCoupons(group.length)} na ${formatGrosze(sum)}`;
      out.push({
        identifier: `${EXPIRY_PREFIX}${daysBefore}-${expiresOn}`,
        date,
        title: daysBefore === 1 ? `${what}: termin mija jutro` : `${what}: termin mija za ${daysBefore} dni`,
        body: [`Ważne do ${formatPlDate(expiresOn)} włącznie`, stores.length ? stores.join(', ') : null].filter(Boolean).join(' · '),
        couponIds: group.map((c) => c.id),
      });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, max);
}
