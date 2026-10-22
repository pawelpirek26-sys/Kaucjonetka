import { planExpiryReminders } from '@/lib/notifications/expiry';

const lidl = { id: 1, name: 'Lidl', brand: 'Lidl', lat: 0, lon: 0, street: null, housenumber: null, city: null, machineCount: 1, machineId: null };

describe('planExpiryReminders', () => {
  const now = new Date(2026, 9, 10, 12, 0); // 10.10.2026 12:00

  it('plans reminders 3 days and 1 day before the last valid day at 10:00', () => {
    const plan = planExpiryReminders([{ id: 'a', amountGrosze: 350, expiresOn: '2026-10-20', store: lidl }], now);
    expect(plan.map((r) => [r.identifier, r.date.toString()])).toEqual([
      ['exp-3-2026-10-20', new Date(2026, 9, 17, 10, 0).toString()],
      ['exp-1-2026-10-20', new Date(2026, 9, 19, 10, 0).toString()],
    ]);
    expect(plan[0]).toMatchObject({
      title: 'Kupon na 3,50 zł: termin mija za 3 dni',
      body: 'Ważne do 20.10.2026 włącznie · Lidl',
    });
    expect(plan[1].title).toBe('Kupon na 3,50 zł: termin mija jutro');
  });

  it('skips reminders in the past and coupons without a date', () => {
    const plan = planExpiryReminders(
      [
        { id: 'a', amountGrosze: 100, expiresOn: '2026-10-12', store: null },
        { id: 'b', amountGrosze: 100, expiresOn: null, store: null },
      ],
      now,
    );
    expect(plan.map((r) => r.identifier)).toEqual(['exp-1-2026-10-12']);
  });

  it('groups coupons expiring the same day and caps the total', () => {
    const plan = planExpiryReminders(
      [
        { id: 'a', amountGrosze: 100, expiresOn: '2026-11-01', store: lidl },
        { id: 'b', amountGrosze: 250, expiresOn: '2026-11-01', store: null },
      ],
      now,
    );
    expect(plan[0]).toMatchObject({ title: '2 kupony na 3,50 zł: termin mija za 3 dni', couponIds: ['a', 'b'] });
    const many = Array.from({ length: 50 }, (_, i) => ({ id: String(i), amountGrosze: 50, expiresOn: `2027-01-${String((i % 28) + 1).padStart(2, '0')}`, store: null }));
    expect(planExpiryReminders(many, now, { max: 40 })).toHaveLength(40);
  });
});
