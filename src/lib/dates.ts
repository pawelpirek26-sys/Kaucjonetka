// Coupon dates are calendar dates (no time zone) stored as 'YYYY-MM-DD'.
// `expires_on` is the last day on which the coupon can still be redeemed.

export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight of an ISO date. */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = fromISODate(iso);
  return toISODate(d) === iso;
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from `today` to `iso` (0 = today, negative = past). */
export function daysBetween(today: ISODate, iso: ISODate): number {
  return Math.round((fromISODate(iso).getTime() - fromISODate(today).getTime()) / 86_400_000);
}

/** 'YYYY-MM-DD' -> 'DD.MM.YYYY' */
export function formatPlDate(iso: ISODate): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** 'DD.MM.YYYY' (also with '-' or '/', two-digit year) -> 'YYYY-MM-DD' or null. */
export function parsePlDate(input: string): ISODate | null {
  const m = input.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}
