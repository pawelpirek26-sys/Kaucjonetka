// Pure helpers for the OSM import: build the Overpass query and turn its JSON
// response into rows for public.import_osm_region(). No Deno/Node APIs here, so the
// same file is unit-tested by Jest (app) and Deno (edge function).
import type { ImportRegion } from './regions.ts';

export type Packaging = 'pet' | 'can' | 'glass';

export type OsmStoreRow = {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: number;
  lon: number;
  name: string | null;
  brand: string;
  brand_wikidata: string | null;
  shop: string;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  postcode: string | null;
  opening_hours: string | null;
};

export type OsmMachineRow = {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: number;
  lon: number;
  name: string | null;
  brand: string | null;
  operator: string | null;
  accepts: Packaging[];
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const STORE_SHOPS = new Set(['supermarket', 'convenience']);

const PACKAGING_TAGS: Record<Packaging, string[]> = {
  pet: ['recycling:plastic_bottles', 'recycling:PET', 'recycling:pet_drink_bottles', 'recycling:plastic'],
  can: ['recycling:cans', 'recycling:beverage_cans', 'recycling:aluminium_cans'],
  glass: ['recycling:glass_bottles', 'recycling:glass'],
};

// overpass-api.de rejects or drops some cloud egress IPs (406, TCP timeouts), so the
// import falls back to a public mirror. OVERPASS_URL may list several, comma-separated.
export const DEFAULT_OVERPASS_URLS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function overpassEndpoints(value?: string | null): string[] {
  const urls = (value ?? '')
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\/[^/\s]+/.test(u));
  return urls.length > 0 ? [...new Set(urls)] : [...DEFAULT_OVERPASS_URLS];
}

// Busy (429) and flaky (5xx) instances are worth one more try; 406 and other 4xx mean
// the request or the caller's IP is refused, so move on to the next endpoint.
export function isRetryableOverpassStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Cheap reachability check served by every Overpass instance next to /interpreter.
export function overpassStatusUrl(interpreterUrl: string): string {
  return /interpreter\/?$/.test(interpreterUrl)
    ? interpreterUrl.replace(/interpreter\/?$/, 'status')
    : interpreterUrl.replace(/\/?$/, '/status');
}

export function buildOverpassQuery(region: ImportRegion, timeoutSeconds = 180): string {
  const iso = `^(${region.code}|${region.legacyCode})$`;
  return [
    `[out:json][timeout:${timeoutSeconds}];`,
    `(`,
    `  area["boundary"="administrative"]["admin_level"="4"]["name"="${region.name}"];`,
    `  area["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"~"${iso}"];`,
    `)->.region;`,
    `(`,
    `  nwr["shop"~"^(supermarket|convenience)$"]["brand"](area.region);`,
    `  nwr["vending"="bottle_return"](area.region);`,
    `  nwr["recycling_type"="reverse_vending_machine"](area.region);`,
    `);`,
    `out center tags qt;`,
  ].join('\n');
}

function text(value: string | undefined, max = 200): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

function coordinates(el: OverpassElement): { lat: number; lon: number } | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function osmType(type: string): OsmStoreRow['osm_type'] | null {
  return type === 'node' || type === 'way' || type === 'relation' ? type : null;
}

export function isMachine(tags: Record<string, string>): boolean {
  return tags.vending === 'bottle_return' || tags.recycling_type === 'reverse_vending_machine';
}

export function isStore(tags: Record<string, string>): boolean {
  return STORE_SHOPS.has(tags.shop ?? '') && !!tags.brand?.trim();
}

export function acceptedPackaging(tags: Record<string, string>): Packaging[] {
  return (Object.keys(PACKAGING_TAGS) as Packaging[]).filter((p) =>
    PACKAGING_TAGS[p].some((key) => tags[key] === 'yes'),
  );
}

export function parseOverpass(json: unknown): { stores: OsmStoreRow[]; machines: OsmMachineRow[] } {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error('overpass_response_without_elements');

  const stores = new Map<string, OsmStoreRow>();
  const machines = new Map<string, OsmMachineRow>();

  for (const el of elements) {
    const type = osmType(el.type);
    const point = coordinates(el);
    const tags = el.tags ?? {};
    if (!type || !point || !Number.isSafeInteger(el.id)) continue;
    const key = `${type}/${el.id}`;

    if (isStore(tags)) {
      stores.set(key, {
        osm_type: type,
        osm_id: el.id,
        ...point,
        name: text(tags.name),
        brand: text(tags.brand, 100)!,
        brand_wikidata: text(tags['brand:wikidata'], 32),
        shop: tags.shop,
        street: text(tags['addr:street'] ?? tags['addr:place']),
        housenumber: text(tags['addr:housenumber'], 32),
        city: text(tags['addr:city'], 100),
        postcode: text(tags['addr:postcode'], 16),
        opening_hours: text(tags.opening_hours, 255),
      });
    }
    if (isMachine(tags)) {
      machines.set(key, {
        osm_type: type,
        osm_id: el.id,
        ...point,
        name: text(tags.name),
        brand: text(tags.brand, 100),
        operator: text(tags.operator, 100),
        accepts: acceptedPackaging(tags),
      });
    }
  }

  return { stores: [...stores.values()], machines: [...machines.values()] };
}
