// Typed wrappers around the Supabase RPCs / views and Polish error messages.
import type { Database } from '@/lib/supabase/database.types';
import { BackendNotConfiguredError, requireSupabase } from '@/lib/supabase/client';
import type { LatLon } from '@/lib/geo';

type Fn = Database['public']['Functions'];
type Enums = Database['public']['Enums'];

export type ReportType = Enums['report_type'];
export type StatusLevel = Enums['machine_status_level'];
export type Packaging = Enums['packaging'];
export type NearestStore = Fn['nearest_stores']['Returns'][number];
export type StoreById = Fn['stores_by_ids']['Returns'][number];
export type MapPoint = Fn['map_points']['Returns'][number];
export type MachineStatusRow = Fn['report_machine']['Returns'];
export type MachineLive = Database['public']['Views']['machines_live']['Row'];

export type MapFilters = {
  brands: string[] | null;
  accepts: Packaging[] | null;
  onlyWorking: boolean;
  storeIds: number[] | null;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  backend_not_configured: 'Aplikacja nie ma połączenia z serwerem (brak konfiguracji).',
  not_authenticated: 'Zaloguj się, aby wysyłać zgłoszenia.',
  invalid_location: 'Nie udało się ustalić Twojej lokalizacji.',
  machine_not_found: 'Nie znaleziono automatu. Odśwież mapę.',
  store_not_found: 'Nie znaleziono sklepu. Odśwież mapę.',
  report_not_found: 'To zgłoszenie już nie istnieje.',
  too_far: 'Jesteś za daleko. Zgłoszenia można wysyłać do 200 m od automatu.',
  rate_limited: 'Wysłano już dużo zgłoszeń w ciągu ostatniej godziny. Spróbuj później.',
  duplicate_report: 'Ten stan automatu już zgłosiłeś w ciągu ostatniej godziny.',
  own_report: 'Nie możesz potwierdzać własnego zgłoszenia.',
  report_too_old: 'To zgłoszenie jest już nieaktualne.',
  target_required: 'Wybierz punkt, którego dotyczy zgłoszenie.',
  network: 'Brak połączenia z internetem. Spróbuj ponownie.',
};

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof BackendNotConfiguredError) return new ApiError('backend_not_configured', MESSAGES.backend_not_configured);
  const raw = (e as { message?: string } | null)?.message ?? String(e);
  const code = Object.keys(MESSAGES).find((k) => raw === k || raw.startsWith(`${k}`)) ??
    (/network|fetch/i.test(raw) ? 'network' : 'unknown');
  return new ApiError(code, MESSAGES[code] ?? 'Coś poszło nie tak. Spróbuj ponownie.');
}

async function call<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let result: { data: T | null; error: unknown };
  try {
    result = await promise;
  } catch (e) {
    throw toApiError(e);
  }
  if (result.error) throw toApiError(result.error);
  return result.data as T;
}

export function nearestStores(at: LatLon, radiusM = 500, limit = 10): Promise<NearestStore[]> {
  return call(requireSupabase().rpc('nearest_stores', { p_lat: at.lat, p_lon: at.lon, p_radius_m: radiusM, p_limit: limit }));
}

export function storesByIds(ids: number[]): Promise<StoreById[]> {
  return call(requireSupabase().rpc('stores_by_ids', { p_ids: ids }));
}

export function mapPoints(bounds: [west: number, south: number, east: number, north: number], f: MapFilters): Promise<MapPoint[]> {
  const [w, s, e, n] = bounds;
  return call(
    requireSupabase().rpc('map_points', {
      p_min_lon: w,
      p_min_lat: s,
      p_max_lon: e,
      p_max_lat: n,
      p_brands: f.brands ?? undefined,
      p_accepts: f.accepts ?? undefined,
      p_only_working: f.onlyWorking,
      p_store_ids: f.storeIds ?? undefined,
      p_limit: 2000,
    }),
  );
}

export function topBrands(limit = 20): Promise<{ brand: string; store_count: number }[]> {
  return call(requireSupabase().rpc('top_brands', { p_limit: limit }));
}

export function machinesAtStore(storeId: number): Promise<MachineLive[]> {
  return call(requireSupabase().from('machines_live').select('*').eq('store_id', storeId).order('id'));
}

export async function machineById(machineId: number): Promise<MachineLive | null> {
  return call(requireSupabase().from('machines_live').select('*').eq('id', machineId).maybeSingle());
}

export function reportMachine(machineId: number, type: ReportType, at: LatLon): Promise<MachineStatusRow> {
  return call(requireSupabase().rpc('report_machine', { p_machine_id: machineId, p_type: type, p_lat: at.lat, p_lon: at.lon }));
}

export function voteReport(reportId: number, stillValid: boolean, at: LatLon): Promise<MachineStatusRow> {
  return call(requireSupabase().rpc('vote_report', { p_report_id: reportId, p_still_valid: stillValid, p_lat: at.lat, p_lon: at.lon }));
}

export function submitMissingMachine(storeId: number, at: LatLon, accepts: Packaging[], note: string | null) {
  return call(
    requireSupabase().rpc('submit_point', {
      p_kind: 'new_machine',
      p_lat: at.lat,
      p_lon: at.lon,
      p_store_id: storeId,
      p_accepts: accepts,
      p_note: note ?? undefined,
    }),
  );
}
