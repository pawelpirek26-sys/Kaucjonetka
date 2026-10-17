import type { MapPoint } from '@/lib/api';
import { containsBounds, normaliseBounds, padBounds, toFeatureCollection } from '@/lib/mapData';

const point = (p: Partial<MapPoint>): MapPoint => ({
  kind: 'store', store_id: 1, machine_id: 11, name: 'Lidl', brand: 'Lidl', lat: 52.2, lon: 21.0,
  status: 'ok', reported_at: '2026-10-10T10:00:00Z', machine_count: 1, accepts: ['pet'], ...p,
});

describe('map data', () => {
  it('builds GeoJSON with stable ids and the "my coupons" flag', () => {
    const fc = toFeatureCollection([point({}), point({ kind: 'machine', store_id: null as unknown as number, machine_id: 99, name: null as unknown as string, brand: null as unknown as string, status: 'broken' })], new Set([1]));
    expect(fc.features.map((f) => [f.id, f.properties.mine, f.properties.status, f.properties.name])).toEqual([
      ['s:1', true, 'ok', 'Lidl'],
      ['m:99', false, 'broken', 'Automat kaucyjny'],
    ]);
    expect(fc.features[0].geometry.coordinates).toEqual([21.0, 52.2]);
  });

  it('pads and compares bounds so small pans do not refetch', () => {
    const view: [number, number, number, number] = [21, 52, 21.1, 52.1];
    const fetched = padBounds(view);
    expect(containsBounds(fetched, [21.02, 52.02, 21.12, 52.12])).toBe(true);
    expect(containsBounds(fetched, [21.2, 52.0, 21.3, 52.1])).toBe(false);
    expect(normaliseBounds([21.1, 52.1, 21, 52])).toEqual(view);
  });
});
