import { addDays, daysBetween, formatPlDate, parsePlDate } from '@/lib/dates';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { countCoupons, plural } from '@/lib/i18n';
import { formatGrosze, groszeToInput, parseZlotyInput } from '@/lib/money';

describe('money', () => {
  it('formats grosze as Polish złoty', () => {
    expect(formatGrosze(350)).toBe('3,50 zł');
    expect(formatGrosze(123456)).toMatch(/^1\s?234,56 zł$/);
  });
  it('parses user input', () => {
    expect(parseZlotyInput('3,5')).toBe(350);
    expect(parseZlotyInput(' 12 zł')).toBe(1200);
    expect(parseZlotyInput('0.50 PLN')).toBe(50);
    expect(parseZlotyInput('abc')).toBeNull();
    expect(parseZlotyInput('1,234')).toBeNull();
  });
  it('round-trips through the input format', () => {
    expect(groszeToInput(305)).toBe('3,05');
    expect(parseZlotyInput(groszeToInput(305))).toBe(305);
  });
});

describe('plural', () => {
  it.each([
    [1, 'kupon'],
    [2, 'kupony'],
    [4, 'kupony'],
    [5, 'kuponów'],
    [12, 'kuponów'],
    [22, 'kupony'],
    [25, 'kuponów'],
    [0, 'kuponów'],
  ])('%i -> %s', (n, form) => expect(plural(n, ['kupon', 'kupony', 'kuponów'])).toBe(form));
  it('formats a count', () => expect(countCoupons(3)).toBe('3 kupony'));
});

describe('dates', () => {
  it('parses Polish dates', () => {
    expect(parsePlDate('4.11.2026')).toBe('2026-11-04');
    expect(parsePlDate('04-11-26')).toBe('2026-11-04');
    expect(parsePlDate('31.02.2026')).toBeNull();
  });
  it('does calendar arithmetic across DST', () => {
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27');
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3);
    expect(formatPlDate('2026-01-05')).toBe('05.01.2026');
  });
});

describe('geo', () => {
  it('computes metres between points', () => {
    // 0.0009° of latitude ≈ 100 m
    expect(distanceMeters({ lat: 52.2297, lon: 21.0122 }, { lat: 52.2306, lon: 21.0122 })).toBeCloseTo(100, -1);
    expect(formatDistance(1530)).toBe('1,5 km');
  });
});
