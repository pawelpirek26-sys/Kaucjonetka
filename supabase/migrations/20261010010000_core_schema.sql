-- Kaucjomat: core schema (points, wallet backup, reports, profiles).
-- Money is stored in grosze (integer). Geometries are geography(Point, 4326) so
-- distances and radii are in metres; every geometry has a GiST index.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.report_type as enum ('ok', 'full', 'rejects', 'no_print', 'off', 'queue');
-- ok = green, warning = yellow, broken = red, unknown = grey (no fresh reports)
create type public.machine_status_level as enum ('ok', 'warning', 'broken', 'unknown');
create type public.coupon_status as enum ('active', 'redeemed', 'expired');
create type public.packaging as enum ('pet', 'can', 'glass');
create type public.point_kind as enum ('new_machine', 'new_store', 'correction', 'closed');
create type public.submission_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Points: stores and reverse vending machines (imported from OSM or added by users)
-- ---------------------------------------------------------------------------
create table public.stores (
  id              bigint generated always as identity primary key,
  osm_type        text check (osm_type in ('node', 'way', 'relation')),
  osm_id          bigint,
  source          text not null default 'osm' check (source in ('osm', 'user')),
  name            text,
  brand           text,
  brand_wikidata  text,
  shop            text,
  street          text,
  housenumber     text,
  city            text,
  postcode        text,
  opening_hours   text,
  geom            extensions.geography(Point, 4326) not null,
  region          text,
  active          boolean not null default true,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint stores_osm_key unique (osm_type, osm_id),
  constraint stores_osm_complete check ((osm_type is null) = (osm_id is null))
);
create index stores_geom_gist on public.stores using gist (geom);
create index stores_brand_idx on public.stores (brand) where active;
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

create table public.machines (
  id            bigint generated always as identity primary key,
  osm_type      text check (osm_type in ('node', 'way', 'relation')),
  osm_id        bigint,
  source        text not null default 'osm' check (source in ('osm', 'user')),
  store_id      bigint references public.stores (id) on delete set null,
  name          text,
  brand         text,
  operator      text,
  accepts       public.packaging[] not null default '{}',
  geom          extensions.geography(Point, 4326) not null,
  region        text,
  active        boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint machines_osm_key unique (osm_type, osm_id),
  constraint machines_osm_complete check ((osm_type is null) = (osm_id is null))
);
create index machines_geom_gist on public.machines using gist (geom);
create index machines_store_id_idx on public.machines (store_id);
create trigger machines_updated_at before update on public.machines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created by trigger)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (char_length(display_name) <= 80),
  backup_enabled  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Coupons: optional cloud backup of the on-device wallet (SQLite is the source of truth).
-- id is generated on the device so upserts are idempotent.
-- ---------------------------------------------------------------------------
create table public.coupons (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_grosze      integer not null check (amount_grosze between 0 and 10000000),
  issued_on          date,
  expires_on         date,
  barcode            text check (char_length(barcode) <= 128),
  barcode_type       text check (char_length(barcode_type) <= 32),
  store_id           bigint references public.stores (id) on delete set null,
  status             public.coupon_status not null default 'active',
  redeemed_at        timestamptz,
  note               text check (char_length(note) <= 500),
  photo_path         text,
  client_updated_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index coupons_user_updated_idx on public.coupons (user_id, updated_at);
create index coupons_store_id_idx on public.coupons (store_id);
create trigger coupons_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

-- Last-write-wins between devices: an update carrying an older client timestamp is ignored.
create function public.coupons_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.client_updated_at < old.client_updated_at then
    return old;
  end if;
  return new;
end;
$$;
create trigger coupons_keep_newest before update on public.coupons
  for each row execute function public.coupons_keep_newest();

-- ---------------------------------------------------------------------------
-- Machine reports, votes ("still the case?") and derived status
-- ---------------------------------------------------------------------------
create table public.machine_reports (
  id          bigint generated always as identity primary key,
  machine_id  bigint not null references public.machines (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        public.report_type not null,
  distance_m  real,
  created_at  timestamptz not null default now()
);
create index machine_reports_machine_created_idx on public.machine_reports (machine_id, created_at desc);
create index machine_reports_user_created_idx on public.machine_reports (user_id, created_at desc);

create table public.report_votes (
  report_id    bigint not null references public.machine_reports (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  still_valid  boolean not null,
  created_at   timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index report_votes_user_created_idx on public.report_votes (user_id, created_at desc);

-- One row per machine; written exclusively by triggers (see 20261010010100_reports.sql).
create table public.machine_status (
  machine_id     bigint primary key references public.machines (id) on delete cascade,
  status         public.machine_status_level not null default 'unknown',
  report_id      bigint references public.machine_reports (id) on delete set null,
  report_type    public.report_type,
  reported_at    timestamptz,
  confirmations  integer not null default 0,
  denials        integer not null default 0,
  valid_until    timestamptz,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Point submissions (missing machine/store, corrections, closed points)
-- ---------------------------------------------------------------------------
create table public.point_submissions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         public.point_kind not null,
  store_id     bigint references public.stores (id) on delete set null,
  machine_id   bigint references public.machines (id) on delete set null,
  name         text check (char_length(name) <= 200),
  brand        text check (char_length(brand) <= 100),
  accepts      public.packaging[] not null default '{}',
  note         text check (char_length(note) <= 1000),
  geom         extensions.geography(Point, 4326) not null,
  status       public.submission_status not null default 'pending',
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index point_submissions_geom_gist on public.point_submissions using gist (geom);
create index point_submissions_user_created_idx on public.point_submissions (user_id, created_at desc);
create index point_submissions_pending_idx on public.point_submissions (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.stores            enable row level security;
alter table public.machines          enable row level security;
alter table public.machine_status    enable row level security;
alter table public.machine_reports   enable row level security;
alter table public.report_votes      enable row level security;
alter table public.point_submissions enable row level security;
alter table public.coupons           enable row level security;
alter table public.profiles          enable row level security;

-- Public map data: readable by everyone, writable only by import / definer functions.
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy machines_read on public.machines for select to anon, authenticated using (true);
create policy machine_status_read on public.machine_status for select to anon, authenticated using (true);

-- Reports, votes and submissions: users see their own rows; writes go through RPCs.
create policy machine_reports_select_own on public.machine_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy report_votes_select_own on public.report_votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy point_submissions_select_own on public.point_submissions
  for select to authenticated using (user_id = (select auth.uid()));

-- Coupons: owner only.
create policy coupons_select_own on public.coupons
  for select to authenticated using (user_id = (select auth.uid()));
create policy coupons_insert_own on public.coupons
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy coupons_update_own on public.coupons
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy coupons_delete_own on public.coupons
  for delete to authenticated using (user_id = (select auth.uid()));

-- Profiles: owner only (row is created by trigger, removed by cascade).
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Table privileges (defence in depth on top of RLS).
revoke all on public.stores, public.machines, public.machine_status,
              public.machine_reports, public.report_votes, public.point_submissions,
              public.coupons, public.profiles
  from anon, authenticated;

grant select on public.stores, public.machines, public.machine_status to anon, authenticated;
grant select on public.machine_reports, public.report_votes, public.point_submissions to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, backup_enabled) on public.profiles to authenticated;

-- machine_status is maintained only by triggers, not even by service_role.
revoke insert, update, delete, truncate on public.machine_status from service_role;

-- Internal functions are not part of the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.coupons_keep_newest() from public, anon, authenticated;
