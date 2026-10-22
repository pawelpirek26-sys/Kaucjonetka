/** Polish plural forms: plural(5, ['kupon', 'kupony', 'kuponów']) -> 'kuponów'. */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const COUPON_FORMS = ['kupon', 'kupony', 'kuponów'] as const;
export const DAY_FORMS = ['dzień', 'dni', 'dni'] as const;

export function countCoupons(n: number): string {
  return `${n} ${plural(n, COUPON_FORMS)}`;
}
