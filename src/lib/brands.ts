// Map badges for store chains: brand colour + a short label instead of a logo file.

export type BrandBadge = { label: string; color: string; textColor: string };

const WHITE = '#FFFFFF';
const DARK = '#1B1B1B';

// Keys are lower-case brand prefixes, longest first wins (e.g. "carrefour express" before "carrefour").
const BRANDS: Record<string, BrandBadge> = {
  'żabka': { label: 'Ż', color: '#006F3C', textColor: WHITE },
  biedronka: { label: 'B', color: '#E30613', textColor: WHITE },
  dino: { label: 'D', color: '#D7141A', textColor: WHITE },
  lewiatan: { label: 'Lw', color: '#00843D', textColor: WHITE },
  'delikatesy centrum': { label: 'DC', color: '#E2001A', textColor: WHITE },
  abc: { label: 'abc', color: '#E4032E', textColor: WHITE },
  lidl: { label: 'L', color: '#0050AA', textColor: '#FFF000' },
  groszek: { label: 'G', color: '#5BA829', textColor: WHITE },
  odido: { label: 'O', color: '#F18A00', textColor: WHITE },
  stokrotka: { label: 'S', color: '#7AB929', textColor: WHITE },
  netto: { label: 'N', color: '#FFE500', textColor: DARK },
  'społem': { label: 'Sp', color: '#C8102E', textColor: WHITE },
  aldi: { label: 'A', color: '#00005F', textColor: WHITE },
  'carrefour express': { label: 'C', color: '#2D9B3A', textColor: WHITE },
  carrefour: { label: 'C', color: '#004E9F', textColor: WHITE },
  orlen: { label: 'Or', color: '#D40000', textColor: WHITE },
  kaufland: { label: 'K', color: '#E10915', textColor: WHITE },
  chorten: { label: 'Ch', color: '#E30613', textColor: WHITE },
  polomarket: { label: 'P', color: '#E2001A', textColor: WHITE },
  livio: { label: 'Li', color: '#E30613', textColor: WHITE },
  'intermarché': { label: 'I', color: '#E2001A', textColor: WHITE },
  auchan: { label: 'Au', color: '#E2001A', textColor: WHITE },
  spar: { label: 'Sp', color: '#00843D', textColor: WHITE },
  'top market': { label: 'T', color: '#E30613', textColor: WHITE },
  'nasz sklep': { label: 'NS', color: '#E30613', textColor: WHITE },
  gama: { label: 'Ga', color: '#0A6EB4', textColor: WHITE },
  'chata polska': { label: 'CP', color: '#B5121B', textColor: WHITE },
  arhelan: { label: 'Ar', color: '#E30613', textColor: WHITE },
  'delikatesy premium': { label: 'DP', color: '#6D1F2B', textColor: WHITE },
  rossmann: { label: 'R', color: '#C3002F', textColor: WHITE },
  'mila': { label: 'M', color: '#00A0E3', textColor: WHITE },
};

const KEYS = Object.keys(BRANDS).sort((a, b) => b.length - a.length);

export const FALLBACK_BADGE: BrandBadge = { label: '', color: '#5B6B73', textColor: WHITE };

/** Badge for a store; unknown chains get a neutral badge with their first letter. */
export function brandBadge(brand: string | null, name: string | null): BrandBadge {
  const source = (brand ?? name ?? '').trim();
  const key = source.toLowerCase();
  const match = KEYS.find((k) => key.startsWith(k));
  if (match) return BRANDS[match];
  return { ...FALLBACK_BADGE, label: source ? source[0].toUpperCase() : '' };
}
