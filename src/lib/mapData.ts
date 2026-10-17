// Pure helpers for the map screen.
import type { MapPoint, StatusLevel } from '@/lib/api';

export type Bounds = [west: number, south: number, east: number, north: number];

/** Below this zoom the map shows a hint instead of loading points (a whole-country query is too big). */
export const MIN_POINTS_ZOOM = 9.5;

export type PointProperties = {
  key: string;
  kind: 'store' | 'machine';
  storeId: number | null;
  machineId: number | null;
  name: string;
  brand: string | null;
  status: StatusLevel;
  machines: number;
  mine: boolean;
  reportedAt: string | null;
};

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, PointProperties>;

export function pointKey(p: Pick<MapPoint, 'kind' | 'store_id' | 'machine_id'>): string {
  return p.kind === 'store' ? `s:${p.store_id}` : `m:${p.machine_id}`;
}

export function toFeatureCollection(points: MapPoint[], mineStoreIds: ReadonlySet<number>): GeoJSON.FeatureCollection<GeoJSON.Point, PointProperties> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => {
      const key = pointKey(p);
      return {
        type: 'Feature',
        id: key,
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          key,
          kind: p.kind === 'store' ? 'store' : 'machine',
          storeId: p.store_id ?? null,
          machineId: p.machine_id ?? null,
          name: p.name ?? p.brand ?? (p.kind === 'store' ? 'Sklep' : 'Automat kaucyjny'),
          brand: p.brand ?? null,
          status: p.status,
          machines: p.machine_count,
          mine: p.store_id !== null && mineStoreIds.has(p.store_id),
          reportedAt: p.reported_at ?? null,
        },
      };
    }),
  };
}

export function padBounds([w, s, e, n]: Bounds, factor = 0.3): Bounds {
  const dx = (e - w) * factor;
  const dy = (n - s) * factor;
  return [w - dx, s - dy, e + dx, n + dy];
}

export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

/** Turn the map's [lng, lat] corner pairs or flat bounds into [w, s, e, n]. */
export function normaliseBounds(b: Bounds): Bounds {
  return [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
}
