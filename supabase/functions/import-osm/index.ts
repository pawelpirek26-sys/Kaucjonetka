// Weekly OSM import for one voivodeship: Overpass -> parse -> public.import_osm_region().
// Called by pg_cron (public.osm_import_next_region) or manually. Authenticated with a
// shared secret header because it is not meant to be called by app users.
//
// POST /functions/v1/import-osm   x-import-secret: <OSM_IMPORT_SECRET>
// body: { "region": "PL-MZ", "wait": false }
import {
  buildOverpassQuery,
  isRetryableOverpassStatus,
  overpassEndpoints,
  overpassStatusUrl,
  parseOverpass,
} from '../_shared/osm.ts';
import { findRegion, type ImportRegion } from '../_shared/regions.ts';

const OVERPASS_URLS = overpassEndpoints(Deno.env.get('OVERPASS_URL'));
const USER_AGENT = 'Kaucjomat/0.1 (OSM import; +https://github.com/pawelpirek26-sys/Kaucjonetka)';
// The free plan stops a worker after 150 s of wall clock; keep room for the RPC.
const BUDGET_MS = 135_000;
const STATUS_TIMEOUT_MS = 8_000;
const MIN_QUERY_MS = 20_000;
const ATTEMPTS_PER_ENDPOINT = 2;
const RETRY_DELAY_MS = 3_000;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Calls a Postgres function through PostgREST with the service role (no SDK needed).
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}_http_${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

class OverpassError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function httpError(res: Response, step: string): Promise<OverpassError> {
  const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 120);
  return new OverpassError(
    `${step}_http_${res.status}${detail ? `: ${detail}` : ''}`,
    isRetryableOverpassStatus(res.status),
  );
}

async function queryEndpoint(url: string, region: ImportRegion, deadline: number) {
  const status = await fetch(overpassStatusUrl(url), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
  });
  if (!status.ok) throw await httpError(status, 'status');
  await status.body?.cancel();

  const left = deadline - Date.now();
  if (left < MIN_QUERY_MS) throw new OverpassError('no_time_left', false);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: new URLSearchParams({ data: buildOverpassQuery(region, Math.floor(left / 1000) - 5) }),
    signal: AbortSignal.timeout(left),
  });
  if (!res.ok) throw await httpError(res, 'query');
  const rows = parseOverpass(await res.json());
  if (rows.stores.length === 0 && rows.machines.length === 0) throw new OverpassError('empty_result', true);
  return rows;
}

// Tries each Overpass endpoint in turn (busy or flaky ones twice). An endpoint that does
// not answer /status quickly is skipped, so a dropped connection does not eat the whole
// wall-clock budget.
async function fetchOverpass(region: ImportRegion, deadline: number) {
  const errors: string[] = [];
  for (const url of OVERPASS_URLS) {
    const host = new URL(url).host;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_ENDPOINT; attempt++) {
      try {
        return { ...(await queryEndpoint(url, region, deadline)), endpoint: host };
      } catch (e) {
        errors.push(`${host}#${attempt}: ${e instanceof Error ? e.message : String(e)}`);
        // network errors and timeouts (not OverpassError) are retried as well
        if (e instanceof OverpassError && !e.retryable) break;
        if (attempt < ATTEMPTS_PER_ENDPOINT) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw new Error(`overpass_failed: ${errors.join(' | ')}`);
}

async function importRegion(code: string) {
  const region = findRegion(code)!;
  const startedAt = Date.now();
  try {
    const { stores, machines, endpoint } = await fetchOverpass(region, startedAt + BUDGET_MS);

    const data = await rpc<Record<string, number>>('import_osm_region', {
      p_region: region.code,
      p_stores: stores,
      p_machines: machines,
    });
    console.log(JSON.stringify({ region: region.code, endpoint, ms: Date.now() - startedAt, ...data }));
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ region: region.code, error: message }));
    await rpc('import_osm_region_failed', { p_region: region.code, p_error: message.slice(0, 500) }).catch(
      (rpcError) => console.error(`import_osm_region_failed: ${rpcError}`),
    );
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('OSM_IMPORT_SECRET');
  if (!secret || !timingSafeEqual(req.headers.get('x-import-secret') ?? '', secret)) {
    return json(401, { error: 'unauthorized' });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body?.region === 'string' ? body.region : '';
  if (!findRegion(code)) return json(400, { error: 'unknown_region' });

  if (body?.wait === true || typeof EdgeRuntime === 'undefined') {
    try {
      return json(200, { region: code, result: await importRegion(code) });
    } catch (e) {
      return json(502, { region: code, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Respond right away (pg_net does not need to hold the connection) and keep working.
  EdgeRuntime.waitUntil(importRegion(code).catch(() => {}));
  return json(202, { region: code, status: 'started' });
});
