import fixture from './fixtures/overpass-sample.json';
import {
  DEFAULT_OVERPASS_URLS,
  acceptedPackaging,
  buildOverpassQuery,
  isMachine,
  isStore,
  overpassEndpoints,
  overpassStatusUrl,
  parseOverpass,
} from '../supabase/functions/_shared/osm';
import { IMPORT_REGIONS, findRegion } from '../supabase/functions/_shared/regions';

describe('parseOverpass', () => {
  const { stores, machines } = parseOverpass(fixture);

  it('keeps only branded supermarkets/convenience stores with coordinates', () => {
    expect(stores.map((s) => `${s.osm_type}/${s.osm_id}`).sort()).toEqual([
      'node/9000000001',
      'node/9000000003',
      'way/900000002',
    ]);
  });

  it('uses the way centre and maps address tags', () => {
    const biedronka = stores.find((s) => s.osm_id === 900000002)!;
    expect(biedronka).toMatchObject({ osm_type: 'way', lat: 52.235, lon: 21.005, brand: 'Biedronka' });
  });

  it('deduplicates repeated elements', () => {
    expect(stores.filter((s) => s.osm_id === 9000000001)).toHaveLength(1);
  });

  it('recognises both machine taggings and their packaging', () => {
    expect(machines.map((m) => [m.osm_id, m.accepts])).toEqual([
      [9000000004, ['pet', 'can']],
      [9000000005, ['glass']],
      [9000000006, []],
    ]);
  });

  it('rejects a response without elements', () => {
    expect(() => parseOverpass({ remark: 'runtime error: timeout' })).toThrow('overpass_response_without_elements');
  });
});

describe('tag helpers', () => {
  it('classifies stores and machines', () => {
    expect(isStore({ shop: 'supermarket', brand: 'Lidl' })).toBe(true);
    expect(isStore({ shop: 'supermarket' })).toBe(false);
    expect(isStore({ shop: 'bakery', brand: 'Putka' })).toBe(false);
    expect(isMachine({ vending: 'bottle_return' })).toBe(true);
    expect(isMachine({ recycling_type: 'reverse_vending_machine' })).toBe(true);
    expect(isMachine({ amenity: 'recycling', recycling_type: 'container' })).toBe(false);
  });

  it('reads packaging only from explicit yes values', () => {
    expect(acceptedPackaging({ 'recycling:cans': 'yes', 'recycling:glass_bottles': 'no' })).toEqual(['can']);
  });
});

describe('regions and query', () => {
  it('covers all 16 voivodeships with unique codes', () => {
    expect(IMPORT_REGIONS).toHaveLength(16);
    expect(new Set(IMPORT_REGIONS.map((r) => r.code)).size).toBe(16);
  });

  it('builds an area query matching name or either ISO code', () => {
    const q = buildOverpassQuery(findRegion('PL-MZ')!);
    expect(q).toContain('["name"="województwo mazowieckie"]');
    expect(q).toContain('"^(PL-MZ|PL-14)$"');
    expect(q).toContain('nwr["vending"="bottle_return"](area.region);');
    expect(q).toContain('nwr["recycling_type"="reverse_vending_machine"](area.region);');
    expect(q).toMatch(/out center tags qt;$/);
  });

  it('passes the remaining time budget to Overpass', () => {
    expect(buildOverpassQuery(findRegion('PL-DS')!, 95)).toMatch(/^\[out:json\]\[timeout:95\];/);
  });
});

describe('Overpass endpoints', () => {
  it('falls back to overpass-api.de and a mirror when OVERPASS_URL is unset or invalid', () => {
    expect(overpassEndpoints(undefined)).toEqual(DEFAULT_OVERPASS_URLS);
    expect(overpassEndpoints('')).toEqual(DEFAULT_OVERPASS_URLS);
    expect(overpassEndpoints('not a url')).toEqual(DEFAULT_OVERPASS_URLS);
    expect(DEFAULT_OVERPASS_URLS[0]).toBe('https://overpass-api.de/api/interpreter');
    expect(DEFAULT_OVERPASS_URLS.length).toBeGreaterThan(1);
  });

  it('reads a comma-separated list in order, without duplicates', () => {
    expect(
      overpassEndpoints(' https://a.example/api/interpreter, http://127.0.0.1:8080/api/interpreter,https://a.example/api/interpreter '),
    ).toEqual(['https://a.example/api/interpreter', 'http://127.0.0.1:8080/api/interpreter']);
  });

  it('derives the status URL next to the interpreter', () => {
    expect(overpassStatusUrl('https://overpass-api.de/api/interpreter')).toBe('https://overpass-api.de/api/status');
    expect(overpassStatusUrl('http://127.0.0.1:8080/api/interpreter')).toBe('http://127.0.0.1:8080/api/status');
    expect(overpassStatusUrl('http://host.docker.internal:54399')).toBe('http://host.docker.internal:54399/status');
  });
});
