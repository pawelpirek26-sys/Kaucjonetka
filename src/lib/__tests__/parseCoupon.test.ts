import { parseCouponText } from '@/lib/ocr/parseCoupon';

describe('parseCouponText', () => {
  it('reads a typical receipt-style coupon', () => {
    const text = [
      'LIDL sp. z o.o. sp.k.',
      'ul. Marszałkowska 104, 00-017 Warszawa',
      'BON KAUCYJNY',
      'Butelki PET 5 x 0,50 zł = 2,50 zł',
      'Puszki 2 x 0,50 zł = 1,00 zł',
      'SUMA: 3,50 zł',
      'Data: 05.10.2026 14:23',
      'Ważny do: 04.11.2026',
      'Nr automatu: 1234567',
    ].join('\n');
    expect(parseCouponText(text)).toEqual({
      amountGrosze: 350,
      issuedOn: '2026-10-05',
      expiresOn: '2026-11-04',
      brand: 'Lidl',
    });
  });

  it('handles keyword and value split over two OCR lines and noisy currency', () => {
    const text = ['BIEDRONKA', 'Kwota do wypłaty', '12,00 zt', 'Termin ważności', '2026-12-31', '01.12.26 09:01'].join('\n');
    expect(parseCouponText(text)).toEqual({
      amountGrosze: 1200,
      issuedOn: '2026-12-01',
      expiresOn: '2026-12-31',
      brand: 'Biedronka',
    });
  });

  it('fixes O/0 confusion and prefers the total over item lines', () => {
    const text = ['Zabka', 'PET 3 x 0,5O', 'RAZEM 1,5O PLN', '10/10/2026'].join('\n');
    expect(parseCouponText(text)).toMatchObject({ amountGrosze: 150, issuedOn: '2026-10-10', brand: 'Żabka' });
  });

  it('without an expiry keyword treats the later of two dates as expiry', () => {
    const text = ['Kaufland', '3,00 zł', '10.10.2026', '09.11.2026'].join('\n');
    expect(parseCouponText(text)).toMatchObject({ issuedOn: '2026-10-10', expiresOn: '2026-11-09' });
  });

  it('does not mistake a date for an amount', () => {
    expect(parseCouponText('Data 05.10.2026').amountGrosze).toBeNull();
  });

  it('falls back to the largest amount when there are no keywords', () => {
    expect(parseCouponText('0,50\n4,50\n1,00').amountGrosze).toBe(450);
  });

  it('returns nulls for unreadable text', () => {
    expect(parseCouponText('~~ ### ~~')).toEqual({ amountGrosze: null, issuedOn: null, expiresOn: null, brand: null });
  });
});
