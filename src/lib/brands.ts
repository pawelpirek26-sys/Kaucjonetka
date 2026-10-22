// Map badges for store chains. The table lives in brands.json, shared with
// scripts/generate-map-icons.py, which renders one badge image per chain.
import BRANDS from './brands.json';

export type BrandBadge = { icon: string; label: string; color: string; textColor: string };

type BrandEntry = { match: string; id: string; label: string; color: string; textColor: string };

// longest prefix first, so "carrefour express" wins over "carrefour"
const ENTRIES = [...(BRANDS as BrandEntry[])].sort((a, b) => b.match.length - a.match.length);

export const FALLBACK_BADGE: BrandBadge = { icon: 'store', label: '', color: '#5B6B73', textColor: '#FFFFFF' };

/** Badge for a store; unknown chains get the generic shop icon. */
export function brandBadge(brand: string | null, name: string | null): BrandBadge {
  const key = (brand ?? name ?? '').trim().toLowerCase();
  const match = key ? ENTRIES.find((e) => key.startsWith(e.match)) : undefined;
  if (!match) return FALLBACK_BADGE;
  return { icon: `brand-${match.id}`, label: match.label, color: match.color, textColor: match.textColor };
}
