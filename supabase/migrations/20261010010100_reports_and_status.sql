-- Kaucjomat: machine status derivation, report/vote/submission RPCs and read helpers.

-- ---------------------------------------------------------------------------
-- Status derivation
-- ---------------------------------------------------------------------------
-- How a report type maps onto the traffic-light status shown on the map.
create function public.report_type_level(p_type public.report_type)
returns public.machine_status_level
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'ok'       then 'ok'
    when 'queue'    then 'warning'
    when 'rejects'  then 'warning'
    when 'full'     then 'broken'
    when 'no_print' then 'broken'
    when 'off'      then 'broken'
  end::public.machine_status_level;
$$;

-- Status of a machine = its most recent report that the community has not refuted
-- (1 + "still" votes - "no longer" votes > 0). A report stays fresh for 6 h from its
-- creation or its latest "still" vote; after that machine_status_live reports grey.
create function public.recompute_machine_status(p_machine_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_fresh_for constant interval := interval '6 hours';
  r record;
begin
  if not exists (select 1 from public.machines where id = p_machine_id) then
    return;
  end if;

  select mr.id,
         mr.type,
         mr.created_at,
         v.yes,
         v.no,
         greatest(mr.created_at, coalesce(v.last_yes, mr.created_at)) as last_confirmed_at
    into r
    from public.machine_reports mr
    cross join lateral (
      select count(*) filter (where rv.still_valid)            as yes,
             count(*) filter (where not rv.still_valid)        as no,
             max(rv.created_at) filter (where rv.still_valid)  as last_yes
        from public.report_votes rv
       where rv.report_id = mr.id
    ) v
   where mr.machine_id = p_machine_id
     and mr.created_at > now() - interval '30 days'
     and 1 + v.yes - v.no > 0
   order by mr.created_at desc, mr.id desc
   limit 1;

  if not found then
    insert into public.machine_status as ms (machine_id, status, updated_at)
    values (p_machine_id, 'unknown', now())
    on conflict (machine_id) do update
      set status = 'unknown', report_id = null, report_type = null, reported_at = null,
          confirmations = 0, denials = 0, valid_until = null, updated_at = now();
    return;
  end if;

  insert into public.machine_status as ms
    (machine_id, status, report_id, report_type, reported_at, confirmations, denials, valid_until, updated_at)
  values
    (p_machine_id, public.report_type_level(r.type), r.id, r.type, r.created_at,
     r.yes, r.no, r.last_confirmed_at + c_fresh_for, now())
  on conflict (machine_id) do update
    set status        = excluded.status,
        report_id     = excluded.report_id,
        report_type   = excluded.report_type,
        reported_at   = excluded.reported_at,
        confirmations = excluded.confirmations,
        denials       = excluded.denials,
        valid_until   = excluded.valid_until,
        updated_at    = excluded.updated_at;
end;
$$;

create function public.tg_machine_reports_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.recompute_machine_status(old.machine_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.machine_id is distinct from old.machine_id) then
    perform public.recompute_machine_status(new.machine_id);
  end if;
  return null;
end;
$$;
create trigger machine_reports_status
  after insert or update or delete on public.machine_reports
  for each row execute function public.tg_machine_reports_status();

create function public.tg_report_votes_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_machine_id bigint;
begin
  select machine_id into v_machine_id
    from public.machine_reports
   where id = coalesce(new.report_id, old.report_id);
  if v_machine_id is not null then
    perform public.recompute_machine_status(v_machine_id);
  end if;
  return null;
end;
$$;
create trigger report_votes_status
  after insert or update or delete on public.report_votes
  for each row execute function public.tg_report_votes_status();

-- Every machine gets a (grey) status row as soon as it exists.
create function public.tg_machines_init_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.machine_status (machine_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger machines_init_status
  after insert on public.machines
  for each row execute function public.tg_machines_init_status();

-- Status with 6 h fade-out applied at read time.
create view public.machine_status_live
with (security_invoker = true)
as
select ms.machine_id,
       case when ms.valid_until > now() then ms.status
            else 'unknown'::public.machine_status_level end as status,
       ms.status        as last_status,
       ms.report_id,
       ms.report_type,
       ms.reported_at,
       ms.confirmations,
       ms.denials,
       ms.valid_until,
       coalesce(ms.valid_until > now(), false) as is_fresh
  from public.machine_status ms;

-- Machines with live status and coordinates, for point cards.
create view public.machines_live
with (security_invoker = true)
as
select m.id,
       m.store_id,
       m.name,
       m.brand,
       m.operator,
       m.accepts,
       m.source,
       extensions.st_y(m.geom::extensions.geometry) as lat,
       extensions.st_x(m.geom::extensions.geometry) as lon,
       coalesce(s.status, 'unknown'::public.machine_status_level) as status,
       s.last_status,
       s.report_id,
       s.report_type,
       s.reported_at,
       s.confirmations,
       s.denials,
       s.valid_until,
       coalesce(s.is_fresh, false) as is_fresh
  from public.machines m
  left join public.machine_status_live s on s.machine_id = m.id
 where m.active;

grant select on public.machine_status_live, public.machines_live to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.make_point(p_lat double precision, p_lon double precision)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'invalid_location' using errcode = '22023';
  end if;
  return extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: report a machine (must be within 200 m, max 10 reports per hour)
-- Errors (message): not_authenticated, invalid_location, machine_not_found,
--                   too_far, rate_limited, duplicate_report
-- ---------------------------------------------------------------------------
create function public.report_machine(
  p_machine_id bigint,
  p_type public.report_type,
  p_lat double precision,
  p_lon double precision
)
returns public.machine_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_distance_m  constant double precision := 200;
  c_max_per_hour    constant integer := 10;
  v_uid       uuid := auth.uid();
  v_geom      extensions.geography;
  v_distance  double precision;
  v_result    public.machine_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_type is null then
    raise exception 'invalid_report_type' using errcode = '22023';
  end if;

  select geom into v_geom from public.machines where id = p_machine_id and active;
  if not found then
    raise exception 'machine_not_found' using errcode = 'P0002';
  end if;

  v_distance := extensions.st_distance(v_geom, public.make_point(p_lat, p_lon));
  if v_distance > c_max_distance_m then
    raise exception 'too_far' using errcode = 'P0001',
      detail = format('distance_m=%s max_m=%s', round(v_distance), c_max_distance_m);
  end if;

  -- Serialise this user's writes so the hourly limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('report:' || v_uid::text, 0));

  if (select count(*) from public.machine_reports
       where user_id = v_uid and created_at > now() - interval '1 hour') >= c_max_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = format('max_per_hour=%s', c_max_per_hour);
  end if;

  if exists (select 1 from public.machine_reports
              where user_id = v_uid and machine_id = p_machine_id and type = p_type
                and created_at > now() - interval '1 hour') then
    raise exception 'duplicate_report' using errcode = 'P0001';
  end if;

  insert into public.machine_reports (machine_id, user_id, type, distance_m)
  values (p_machine_id, v_uid, p_type, v_distance);

  select * into v_result from public.machine_status where machine_id = p_machine_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: answer "still the case?" for a report (within 200 m, report < 24 h old,
-- not your own report, max 30 votes per hour). Re-voting changes the vote.
-- ---------------------------------------------------------------------------
create function public.vote_report(
  p_report_id bigint,
  p_still_valid boolean,
  p_lat double precision,
  p_lon double precision
)
returns public.machine_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_distance_m  constant double precision := 200;
  c_max_per_hour    constant integer := 30;
  v_uid        uuid := auth.uid();
  v_report     record;
  v_distance   double precision;
  v_result     public.machine_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_still_valid is null then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;

  select mr.id, mr.machine_id, mr.user_id, mr.created_at, m.geom
    into v_report
    from public.machine_reports mr
    join public.machines m on m.id = mr.machine_id and m.active
   where mr.id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;
  if v_report.created_at < now() - interval '24 hours' then
    raise exception 'report_too_old' using errcode = 'P0001';
  end if;
  if v_report.user_id = v_uid then
    raise exception 'own_report' using errcode = 'P0001';
  end if;

  v_distance := extensions.st_distance(v_report.geom, public.make_point(p_lat, p_lon));
  if v_distance > c_max_distance_m then
    raise exception 'too_far' using errcode = 'P0001',
      detail = format('distance_m=%s max_m=%s', round(v_distance), c_max_distance_m);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vote:' || v_uid::text, 0));

  if (select count(*) from public.report_votes
       where user_id = v_uid and created_at > now() - interval '1 hour') >= c_max_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001',
      detail = format('max_per_hour=%s', c_max_per_hour);
  end if;

  insert into public.report_votes (report_id, user_id, still_valid)
  values (p_report_id, v_uid, p_still_valid)
  on conflict (report_id, user_id) do update
    set still_valid = excluded.still_valid, created_at = now();

  select * into v_result from public.machine_status where machine_id = v_report.machine_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit a missing / changed point (max 5 per hour, 20 per day).
-- New points must be submitted from within 200 m of the given location's target
-- (the device location is the point location for new_machine / new_store).
-- ---------------------------------------------------------------------------
create function public.submit_point(
  p_kind public.point_kind,
  p_lat double precision,
  p_lon double precision,
  p_store_id bigint default null,
  p_machine_id bigint default null,
  p_name text default null,
  p_brand text default null,
  p_accepts public.packaging[] default '{}',
  p_note text default null
)
returns public.point_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_distance_m  constant double precision := 200;
  c_max_per_hour    constant integer := 5;
  c_max_per_day     constant integer := 20;
  v_uid     uuid := auth.uid();
  v_point   extensions.geography := public.make_point(p_lat, p_lon);
  v_target  extensions.geography;
  v_result  public.point_submissions;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kind is null then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_kind in ('correction', 'closed') then
    if p_store_id is null and p_machine_id is null then
      raise exception 'target_required' using errcode = '22023';
    end if;
  end if;

  if p_machine_id is not null then
    select geom into v_target from public.machines where id = p_machine_id;
    if not found then raise exception 'machine_not_found' using errcode = 'P0002'; end if;
  elsif p_store_id is not null then
    select geom into v_target from public.stores where id = p_store_id;
    if not found then raise exception 'store_not_found' using errcode = 'P0002'; end if;
  end if;

  if v_target is not null and extensions.st_distance(v_target, v_point) > c_max_distance_m then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('submit:' || v_uid::text, 0));

  if (select count(*) from public.point_submissions
       where user_id = v_uid and created_at > now() - interval '1 hour') >= c_max_per_hour
     or (select count(*) from public.point_submissions
          where user_id = v_uid and created_at > now() - interval '1 day') >= c_max_per_day then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.point_submissions
    (user_id, kind, store_id, machine_id, name, brand, accepts, note, geom)
  values
    (v_uid, p_kind, p_store_id, p_machine_id, nullif(trim(p_name), ''), nullif(trim(p_brand), ''),
     coalesce(p_accepts, '{}'), nullif(trim(p_note), ''), coalesce(v_target, v_point))
  returning * into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation (service_role only): approve or reject a submission.
-- ---------------------------------------------------------------------------
create function public.review_point_submission(p_id bigint, p_approve boolean)
returns public.point_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub     public.point_submissions;
  v_store   bigint;
begin
  select * into v_sub from public.point_submissions where id = p_id for update;
  if not found then raise exception 'submission_not_found' using errcode = 'P0002'; end if;
  if v_sub.status <> 'pending' then raise exception 'already_reviewed' using errcode = 'P0001'; end if;

  if p_approve then
    if v_sub.kind = 'new_machine' then
      v_store := coalesce(v_sub.store_id, (
        select s.id from public.stores s
         where s.active and extensions.st_dwithin(s.geom, v_sub.geom, 100)
         order by extensions.st_distance(s.geom, v_sub.geom)
         limit 1));
      insert into public.machines (source, store_id, name, brand, accepts, geom)
      values ('user', v_store, v_sub.name, v_sub.brand, v_sub.accepts, v_sub.geom);
    elsif v_sub.kind = 'new_store' then
      insert into public.stores (source, name, brand, geom)
      values ('user', v_sub.name, v_sub.brand, v_sub.geom);
    elsif v_sub.kind = 'closed' then
      update public.machines set active = false where id = v_sub.machine_id;
      if v_sub.machine_id is null then
        update public.stores set active = false where id = v_sub.store_id;
      end if;
    end if;
    -- 'correction' is applied by hand; approving only records the decision.
  end if;

  update public.point_submissions
     set status = case when p_approve then 'approved' else 'rejected' end::public.submission_status,
         reviewed_at = now()
   where id = p_id
  returning * into v_sub;
  return v_sub;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------
-- Nearest active stores (for assigning a coupon and for geofence candidates).
create function public.nearest_stores(
  p_lat double precision,
  p_lon double precision,
  p_radius_m double precision default 500,
  p_limit integer default 10
)
returns table (
  id bigint,
  name text,
  brand text,
  shop text,
  street text,
  housenumber text,
  city text,
  lat double precision,
  lon double precision,
  distance_m double precision,
  machine_count integer,
  machine_id bigint
)
language sql
stable
set search_path = ''
as $$
  with here as (select public.make_point(p_lat, p_lon) as g)
  select s.id, s.name, s.brand, s.shop, s.street, s.housenumber, s.city,
         extensions.st_y(s.geom::extensions.geometry),
         extensions.st_x(s.geom::extensions.geometry),
         extensions.st_distance(s.geom, here.g),
         coalesce(m.cnt, 0)::integer,
         m.first_id
    from public.stores s
    cross join here
    left join lateral (
      select count(*) as cnt, min(mm.id) as first_id
        from public.machines mm
       where mm.store_id = s.id and mm.active
    ) m on true
   where s.active
     and extensions.st_dwithin(s.geom, here.g, least(greatest(p_radius_m, 1), 50000))
   order by extensions.st_distance(s.geom, here.g)
   limit least(greatest(p_limit, 1), 100);
$$;

-- Points for the map inside a bounding box. A point is a store (with its machines'
-- aggregated status) or a stand-alone machine that has no store within reach.
create function public.map_points(
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_brands text[] default null,
  p_accepts public.packaging[] default null,
  p_only_working boolean default false,
  p_store_ids bigint[] default null,
  p_limit integer default 2000
)
returns table (
  kind text,
  store_id bigint,
  machine_id bigint,
  name text,
  brand text,
  lat double precision,
  lon double precision,
  status public.machine_status_level,
  reported_at timestamptz,
  machine_count integer,
  accepts public.packaging[]
)
language sql
stable
set search_path = ''
as $$
  with box as (
    select extensions.st_makeenvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326)::extensions.geography as g
  ),
  store_points as (
    select 'store'::text as kind,
           s.id as store_id,
           agg.first_machine_id as machine_id,
           s.name,
           s.brand,
           s.geom,
           coalesce(agg.status, 'unknown'::public.machine_status_level) as status,
           agg.reported_at,
           coalesce(agg.cnt, 0)::integer as machine_count,
           coalesce(acc.accepts, '{}') as accepts
      from public.stores s
      cross join box
      left join lateral (
        select count(*) as cnt,
               min(ml.id) as first_machine_id,
               -- the freshest report wins; stale machines are grey
               (array_agg(ml.status order by ml.is_fresh desc, ml.reported_at desc nulls last))[1] as status,
               max(ml.reported_at) filter (where ml.is_fresh) as reported_at
          from public.machines_live ml
         where ml.store_id = s.id
      ) agg on true
      left join lateral (
        select array_agg(distinct a order by a) as accepts
          from public.machines_live ml
          cross join unnest(ml.accepts) a
         where ml.store_id = s.id
      ) acc on true
     where s.active and s.geom operator(extensions.&&) box.g
  ),
  machine_points as (
    select 'machine'::text, null::bigint, ml.id, ml.name, ml.brand, m.geom,
           ml.status, case when ml.is_fresh then ml.reported_at end, 1, ml.accepts
      from public.machines m
      join public.machines_live ml on ml.id = m.id
      cross join box
     where m.store_id is null and m.geom operator(extensions.&&) box.g
  ),
  points as (
    select * from store_points
    union all
    select * from machine_points
  )
  select p.kind, p.store_id, p.machine_id, p.name, p.brand,
         extensions.st_y(p.geom::extensions.geometry),
         extensions.st_x(p.geom::extensions.geometry),
         p.status, p.reported_at, p.machine_count, p.accepts
    from points p
   where (p_brands is null or p.brand = any (p_brands))
     and (p_accepts is null or p.accepts operator(pg_catalog.&&) p_accepts)
     and (not coalesce(p_only_working, false) or p.status in ('ok', 'warning'))
     and (p_store_ids is null or p.store_id = any (p_store_ids))
   order by (p.status = 'unknown'), p.machine_count desc, p.store_id
   limit least(greatest(p_limit, 1), 5000);
$$;

-- Most common store brands (for the map filter).
create function public.top_brands(p_limit integer default 30)
returns table (brand text, store_count bigint)
language sql
stable
set search_path = ''
as $$
  select s.brand, count(*)
    from public.stores s
   where s.active and s.brand is not null
   group by s.brand
   order by count(*) desc, s.brand
   limit least(greatest(p_limit, 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.recompute_machine_status(bigint) from public, anon, authenticated;
revoke execute on function public.tg_machine_reports_status() from public, anon, authenticated;
revoke execute on function public.tg_report_votes_status() from public, anon, authenticated;
revoke execute on function public.tg_machines_init_status() from public, anon, authenticated;

revoke execute on function public.report_machine(bigint, public.report_type, double precision, double precision) from public, anon;
revoke execute on function public.vote_report(bigint, boolean, double precision, double precision) from public, anon;
revoke execute on function public.submit_point(public.point_kind, double precision, double precision, bigint, bigint, text, text, public.packaging[], text) from public, anon;
grant execute on function public.report_machine(bigint, public.report_type, double precision, double precision) to authenticated;
grant execute on function public.vote_report(bigint, boolean, double precision, double precision) to authenticated;
grant execute on function public.submit_point(public.point_kind, double precision, double precision, bigint, bigint, text, text, public.packaging[], text) to authenticated;

revoke execute on function public.review_point_submission(bigint, boolean) from public, anon, authenticated;
grant execute on function public.review_point_submission(bigint, boolean) to service_role;
