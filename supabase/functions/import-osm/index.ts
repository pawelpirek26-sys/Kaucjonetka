// Weekly OSM import for one voivodeship: Overpass -> parse -> public.import_osm_region().
// Called by pg_cron (public.osm_import_next_region) or manually. Authenticated with a
// shared secret header because it is not meant to be called by app users.
//
// POST /functions/v1/import-osm   x-import-secret: <OSM_IMPORT_SECRET>
// body: { "region": "PL-MZ", "wait": false }
import { buildOverpassQuery, parseOverpass } from '../_shared/osm.ts';
import { findRegion } from '../_shared/regions.ts';

const OVERPASS_URL = Deno.env.get('OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'Kaucjomat/0.1 (OSM import; +https://github.com/pawelpirek26-sys/Kaucjonetka)';

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

async function importRegion(code: string) {
  const region = findRegion(code)!;
  const startedAt = Date.now();
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: new URLSearchParams({ data: buildOverpassQuery(region) }),
      signal: AbortSignal.timeout(190_000),
    });
    if (!res.ok) throw new Error(`overpass_http_${res.status}`);
    const { stores, machines } = parseOverpass(await res.json());
    if (stores.length === 0 && machines.length === 0) throw new Error('overpass_empty_result');

    const data = await rpc<Record<string, number>>('import_osm_region', {
      p_region: region.code,
      p_stores: stores,
      p_machines: machines,
    });
    console.log(JSON.stringify({ region: region.code, ms: Date.now() - startedAt, ...data }));
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
