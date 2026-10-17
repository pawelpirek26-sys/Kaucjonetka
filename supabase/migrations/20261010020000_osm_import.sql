-- Kaucjomat: weekly import of stores and reverse vending machines from OpenStreetMap.
--
-- Flow: pg_cron ticks every 5 min between 01:00 and 03:55 UTC and calls
-- osm_import_next_region(), which picks one voivodeship whose data is older than
-- 6 days and POSTs to the import-osm Edge Function (pg_net). The function queries
-- Overpass and calls import_osm_region(). Every region is therefore refreshed
-- weekly, and a failed region is retried 30 min later.
--
-- Required Vault secrets (set once per environment, never in the repo):
--   kaucjomat_functions_url      e.g. https://<project-ref>.supabase.co/functions/v1
--   kaucjomat_osm_import_secret  same value as the OSM_IMPORT_SECRET function secret
--
-- Data © OpenStreetMap contributors, ODbL 1.0 (attribution shown in the app).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.osm_import_regions (
  code             text primary key,
  name             text not null,
  last_started_at  timestamptz,
  last_success_at  timestamptz,
  last_failed_at   timestamptz,
  last_error       text,
  stores_count     integer,
  machines_count   integer
);

-- Keep in sync with supabase/functions/_shared/regions.ts
insert into public.osm_import_regions (code, name) values
  ('PL-DS', 'województwo dolnośląskie'),
  ('PL-KP', 'województwo kujawsko-pomorskie'),
  ('PL-LU', 'województwo lubelskie'),
  ('PL-LB', 'województwo lubuskie'),
  ('PL-LD', 'województwo łódzkie'),
  ('PL-MA', 'województwo małopolskie'),
  ('PL-MZ', 'województwo mazowieckie'),
  ('PL-OP', 'województwo opolskie'),
  ('PL-PK', 'województwo podkarpackie'),
  ('PL-PD', 'województwo podlaskie'),
  ('PL-PM', 'województwo pomorskie'),
  ('PL-SL', 'województwo śląskie'),
  ('PL-SK', 'województwo świętokrzyskie'),
  ('PL-WN', 'województwo warmińsko-mazurskie'),
  ('PL-WP', 'województwo wielkopolskie'),
  ('PL-ZP', 'województwo zachodniopomorskie');

create table public.osm_import_runs (
  id                    bigint generated always as identity primary key,
  region                text not null references public.osm_import_regions (code),
  finished_at           timestamptz not null default now(),
  stores_upserted       integer,
  machines_upserted     integer,
  machines_linked       integer,
  stores_deactivated    integer,
  machines_deactivated  integer,
  error                 text
);
create index osm_import_runs_region_idx on public.osm_import_runs (region, finished_at desc);

alter table public.osm_import_regions enable row level security;
alter table public.osm_import_runs enable row level security;
revoke all on public.osm_import_regions, public.osm_import_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Upsert one region's data (called by the Edge Function with the service role).
-- ---------------------------------------------------------------------------
create function public.import_osm_region(p_region text, p_stores jsonb, p_machines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  c_link_radius_m     constant double precision := 150;
  c_supermarket_bonus constant double precision := 50;
  c_stale_after       constant interval := interval '15 days';
  v_stores            integer;
  v_machines          integer;
  v_linked            integer;
  v_stale_stores      integer;
  v_stale_machines    integer;
  v_result            jsonb;
begin
  if not exists (select 1 from public.osm_import_regions where code = p_region) then
    raise exception 'unknown_region' using errcode = '22023';
  end if;

  with input as (
    select distinct on (x.osm_type, x.osm_id) x.*
      from jsonb_to_recordset(coalesce(p_stores, '[]'::jsonb)) as x(
        osm_type text, osm_id bigint, lat double precision, lon double precision,
        name text, brand text, brand_wikidata text, shop text, street text,
        housenumber text, city text, postcode text, opening_hours text)
     where x.osm_type in ('node', 'way', 'relation') and x.osm_id is not null
       and x.lat between -90 and 90 and x.lon between -180 and 180
  ),
  upserted as (
    insert into public.stores as s
      (osm_type, osm_id, source, name, brand, brand_wikidata, shop, street, housenumber,
       city, postcode, opening_hours, geom, region, active, last_seen_at)
    select osm_type, osm_id, 'osm', name, brand, brand_wikidata, shop, street, housenumber,
           city, postcode, opening_hours, public.make_point(lat, lon), p_region, true, now()
      from input
    on conflict (osm_type, osm_id) do update
      set name = excluded.name, brand = excluded.brand, brand_wikidata = excluded.brand_wikidata,
          shop = excluded.shop, street = excluded.street, housenumber = excluded.housenumber,
          city = excluded.city, postcode = excluded.postcode, opening_hours = excluded.opening_hours,
          geom = excluded.geom, region = excluded.region, active = true,
          last_seen_at = excluded.last_seen_at
    returning 1
  )
  select count(*) into v_stores from upserted;

  with input as (
    select distinct on (x.osm_type, x.osm_id) x.*
      from jsonb_to_recordset(coalesce(p_machines, '[]'::jsonb)) as x(
        osm_type text, osm_id bigint, lat double precision, lon double precision,
        name text, brand text, operator text, accepts public.packaging[])
     where x.osm_type in ('node', 'way', 'relation') and x.osm_id is not null
       and x.lat between -90 and 90 and x.lon between -180 and 180
  ),
  upserted as (
    insert into public.machines as m
      (osm_type, osm_id, source, name, brand, operator, accepts, geom, region, active, last_seen_at)
    select osm_type, osm_id, 'osm', name, brand, operator, coalesce(accepts, '{}'),
           public.make_point(lat, lon), p_region, true, now()
      from input
    on conflict (osm_type, osm_id) do update
      set name = excluded.name, brand = excluded.brand, operator = excluded.operator,
          accepts = excluded.accepts, geom = excluded.geom, region = excluded.region,
          active = true, last_seen_at = excluded.last_seen_at
    returning 1
  )
  select count(*) into v_machines from upserted;

  -- Points not seen for two weekly runs are hidden (kept for history and coupons).
  update public.stores set active = false
   where source = 'osm' and region = p_region and active and last_seen_at < now() - c_stale_after;
  get diagnostics v_stale_stores = row_count;

  update public.machines set active = false
   where source = 'osm' and region = p_region and active and last_seen_at < now() - c_stale_after;
  get diagnostics v_stale_machines = row_count;

  -- Link OSM machines to the nearest store within 150 m; supermarkets get a 50 m head
  -- start because that is where the large machines usually stand.
  with nearest as (
    select m.id,
           (select s.id
              from public.stores s
             where s.active and extensions.st_dwithin(s.geom, m.geom, c_link_radius_m)
             order by extensions.st_distance(s.geom, m.geom)
                      - case when s.shop = 'supermarket' then c_supermarket_bonus else 0 end,
                      s.id
             limit 1) as store_id
      from public.machines m
     where m.source = 'osm' and m.region = p_region and m.active
  )
  update public.machines m
     set store_id = n.store_id
    from nearest n
   where m.id = n.id and m.store_id is distinct from n.store_id;
  get diagnostics v_linked = row_count;

  update public.osm_import_regions
     set last_success_at = now(), last_error = null,
         stores_count = v_stores, machines_count = v_machines
   where code = p_region;

  insert into public.osm_import_runs
    (region, stores_upserted, machines_upserted, machines_linked, stores_deactivated, machines_deactivated)
  values
    (p_region, v_stores, v_machines, v_linked, v_stale_stores, v_stale_machines);

  v_result := jsonb_build_object(
    'stores', v_stores, 'machines', v_machines, 'linked', v_linked,
    'stores_deactivated', v_stale_stores, 'machines_deactivated', v_stale_machines);
  return v_result;
end;
$$;

create function public.import_osm_region_failed(p_region text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.osm_import_regions
     set last_failed_at = now(), last_error = left(p_error, 500)
   where code = p_region;
  if found then
    insert into public.osm_import_runs (region, error) values (p_region, left(p_error, 500));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler: start the import of the next region that is due.
-- ---------------------------------------------------------------------------
create function public.osm_import_next_region()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_secret  text;
  v_code    text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'kaucjomat_functions_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'kaucjomat_osm_import_secret';
  if v_url is null or v_secret is null then
    raise warning 'osm import skipped: set Vault secrets kaucjomat_functions_url and kaucjomat_osm_import_secret';
    return null;
  end if;

  select code into v_code
    from public.osm_import_regions
   where (last_success_at is null or last_success_at < now() - interval '6 days')
     and (last_started_at is null or last_started_at < now() - interval '30 minutes')
   order by last_success_at nulls first, last_started_at nulls first, code
   limit 1
   for update skip locked;
  if v_code is null then
    return null;
  end if;

  update public.osm_import_regions set last_started_at = now() where code = v_code;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/import-osm',
    body := jsonb_build_object('region', v_code),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-import-secret', v_secret),
    timeout_milliseconds := 30000
  );
  return v_code;
end;
$$;

revoke execute on function public.import_osm_region(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.import_osm_region_failed(text, text) from public, anon, authenticated;
revoke execute on function public.osm_import_next_region() from public, anon, authenticated;
grant execute on function public.import_osm_region(text, jsonb, jsonb) to service_role;
grant execute on function public.import_osm_region_failed(text, text) to service_role;

select cron.schedule('kaucjomat-osm-import', '*/5 1-3 * * *', 'select public.osm_import_next_region()');
