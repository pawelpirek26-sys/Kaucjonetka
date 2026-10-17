// Extracts amount, dates and store chain from the OCR text of a deposit coupon
// ("bon kaucyjny") printed by a reverse vending machine. Pure function: the result is
// only a suggestion that the user confirms or corrects in the form.
import { isValidISODate, type ISODate } from '@/lib/dates';

export type ParsedCoupon = {
  amountGrosze: number | null;
  issuedOn: ISODate | null;
  expiresOn: ISODate | null;
  brand: string | null;
};

const TOTAL_KEYWORDS =
  /(suma|razem|łącznie|lacznie|wartość|wartosc|wartosć|kwota|do wypłaty|do wyplaty|do zwrotu|do odbioru|bon na|total|należność|naleznosc)/i;
const EXPIRY_KEYWORDS = /(ważn|wazn|waźn|termin|do dnia|valid|wykorzystaj|realizacja do|realizuj do|zrealizuj)/i;
const MULTIPLICATION = /\d\s*[x×*]\s*\d/i;
const CURRENCY = /(z[łlt1!i]|pln)/i;
const AMOUNT_RE = /(\d{1,4})\s?[,.]\s?(\d{2})(?!\d)/g;
const DATE_RE = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{4}|\d{2})(?!\d)/g;

// Canonical names match the OSM `brand` tag so the coupon can be matched to a store.
const BRANDS: readonly [RegExp, string][] = [
  [/\blidl\b/, 'Lidl'],
  [/\bbiedronka\b/, 'Biedronka'],
  [/\bkaufland\b/, 'Kaufland'],
  [/\bauchan\b/, 'Auchan'],
  [/\bcarrefour\b/, 'Carrefour'],
  [/\bnetto\b/, 'Netto'],
  [/\bdino\b/, 'Dino'],
  [/\bzabka\b/, 'Żabka'],
  [/\bstokrotka\b/, 'Stokrotka'],
  [/\blewiatan\b/, 'Lewiatan'],
  [/\bpolomarket\b/, 'POLOmarket'],
  [/\bintermarche\b/, 'Intermarché'],
  [/\baldi\b/, 'Aldi'],
  [/\bdelikatesy centrum\b/, 'Delikatesy Centrum'],
  [/\beurospar\b/, 'Eurospar'],
  [/\bspar\b/, 'Spar'],
  [/\bselgros\b/, 'Selgros'],
  [/\bmakro\b/, 'Makro'],
  [/\bleclerc\b/, 'E.Leclerc'],
  [/\bfreshmarket\b/, 'Freshmarket'],
  [/\bgroszek\b/, 'Groszek'],
  [/\btopaz\b/, 'Topaz'],
  [/\bmila\b/, 'Mila'],
  [/\bspolem\b/, 'Społem'],
  [/\bprim market\b/, 'Prim Market'],
  [/\bchata polska\b/, 'Chata Polska'],
];

function stripDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Fixes the most common OCR confusions inside numbers ("3,5O" -> "3,50", "l2,00" -> "12,00"). */
function normaliseLine(line: string): string {
  return line
    .replace(/(\d[,.]?\d?)[Oo]/g, (_, head: string) => `${head}0`)
    .replace(/[Il|](\d)/g, (_, digit: string) => `1${digit}`)
    .trim();
}

function toISO(day: number, month: number, year: number): ISODate | null {
  const y = year < 100 ? 2000 + year : year;
  if (y < 2020 || y > 2100) return null;
  const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

function datesIn(line: string): ISODate[] {
  const out: ISODate[] = [];
  for (const m of line.matchAll(DATE_RE)) {
    const iso = m[1] ? toISO(Number(m[3]), Number(m[2]), Number(m[1])) : toISO(Number(m[4]), Number(m[5]), Number(m[6]));
    if (iso) out.push(iso);
  }
  return out;
}

function amountsIn(line: string): number[] {
  const withoutDates = line.replace(DATE_RE, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ');
  const out: number[] = [];
  for (const m of withoutDates.matchAll(AMOUNT_RE)) {
    const grosze = Number(m[1]) * 100 + Number(m[2]);
    if (grosze >= 10 && grosze <= 999_999) out.push(grosze);
  }
  return out;
}

function parseAmount(lines: string[]): number | null {
  let best: { priority: number; grosze: number } | null = null;
  const consider = (priority: number, grosze: number) => {
    if (!best || priority > best.priority || (priority === best.priority && grosze > best.grosze)) {
      best = { priority, grosze };
    }
  };

  lines.forEach((line, i) => {
    const amounts = amountsIn(line);
    const isTotal = TOTAL_KEYWORDS.test(line);
    if (isTotal && amounts.length === 0) {
      // "SUMA" on its own line, amount on the next one
      const next = lines[i + 1] ? amountsIn(lines[i + 1]) : [];
      if (next.length > 0) consider(3, next[0]);
      return;
    }
    if (MULTIPLICATION.test(line)) {
      // "5 x 0,50 = 2,50" is a subtotal; still a fallback when nothing else is found
      amounts.forEach((g) => consider(0, g));
      return;
    }
    const priority = isTotal ? 3 : CURRENCY.test(line) ? 2 : 1;
    amounts.forEach((g) => consider(priority, g));
  });

  return (best as { priority: number; grosze: number } | null)?.grosze ?? null;
}

function parseDates(lines: string[]): { issuedOn: ISODate | null; expiresOn: ISODate | null } {
  const expiry: ISODate[] = [];
  const other: ISODate[] = [];

  lines.forEach((line, i) => {
    const dates = datesIn(line);
    if (EXPIRY_KEYWORDS.test(line)) {
      if (dates.length > 0) expiry.push(...dates);
      else if (lines[i + 1]) expiry.push(...datesIn(lines[i + 1]));
      return;
    }
    const previous = lines[i - 1];
    if (previous && EXPIRY_KEYWORDS.test(previous) && datesIn(previous).length === 0) return;
    other.push(...dates);
  });

  let expiresOn: ISODate | null = expiry[0] ?? null;
  let issuedOn: ISODate | null = other.find((d) => d !== expiresOn) ?? null;

  if (!expiresOn && other.length >= 2) {
    const sorted = [...new Set(other)].sort();
    issuedOn = sorted[0];
    expiresOn = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  }
  if (issuedOn && expiresOn && expiresOn < issuedOn) [issuedOn, expiresOn] = [expiresOn, issuedOn];
  return { issuedOn, expiresOn };
}

function parseBrand(text: string): string | null {
  const plain = stripDiacritics(text);
  return BRANDS.find(([re]) => re.test(plain))?.[1] ?? null;
}

export function parseCouponText(text: string): ParsedCoupon {
  const lines = text
    .split(/\r?\n/)
    .map(normaliseLine)
    .filter((l) => l.length > 0);
  return {
    amountGrosze: parseAmount(lines),
    ...parseDates(lines),
    brand: parseBrand(text),
  };
}
