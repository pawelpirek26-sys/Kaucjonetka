-- Kaucjomat: a missing machine at a known store is approved automatically once two
-- different users have reported it (within 30 days). Stores that already have an
-- active machine, stand-alone machines and other submission kinds still go through
-- review_point_submission (service_role).

create or replace function public.submit_point(
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
  c_max_distance_m      constant double precision := 200;
  c_max_per_hour        constant integer := 5;
  c_max_per_day         constant integer := 20;
  c_users_to_approve    constant integer := 2;
  c_confirmation_window constant interval := interval '30 days';
  v_uid      uuid := auth.uid();
  v_point    extensions.geography := public.make_point(p_lat, p_lon);
  v_target   extensions.geography;
  v_result   public.point_submissions;
  v_users    integer;
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

  if p_kind = 'new_machine' and p_store_id is not null and exists (
       select 1 from public.point_submissions
        where user_id = v_uid and kind = 'new_machine' and store_id = p_store_id and status = 'pending') then
    raise exception 'duplicate_submission' using errcode = 'P0001';
  end if;

  insert into public.point_submissions
    (user_id, kind, store_id, machine_id, name, brand, accepts, note, geom)
  values
    (v_uid, p_kind, p_store_id, p_machine_id, nullif(trim(p_name), ''), nullif(trim(p_brand), ''),
     coalesce(p_accepts, '{}'), nullif(trim(p_note), ''), coalesce(v_target, v_point))
  returning * into v_result;

  -- Auto-approval: second distinct user confirms a machine at a store without one.
  if p_kind = 'new_machine' and p_store_id is not null then
    -- one decision per store at a time, so two simultaneous confirmations create one machine
    perform pg_advisory_xact_lock(hashtextextended('store-machine:' || p_store_id::text, 0));

    if not exists (select 1 from public.machines where store_id = p_store_id and active) then
      select count(distinct user_id) into v_users
        from public.point_submissions
       where kind = 'new_machine' and store_id = p_store_id and status = 'pending'
         and created_at > now() - c_confirmation_window;

      if v_users >= c_users_to_approve then
        insert into public.machines (source, store_id, accepts, geom)
        select 'user', p_store_id,
               coalesce((select array_agg(distinct a order by a)
                           from public.point_submissions ps
                           cross join unnest(ps.accepts) a
                          where ps.kind = 'new_machine' and ps.store_id = p_store_id and ps.status = 'pending'), '{}'),
               s.geom
          from public.stores s
         where s.id = p_store_id;

        update public.point_submissions
           set status = 'approved', reviewed_at = now()
         where kind = 'new_machine' and store_id = p_store_id and status = 'pending';

        select * into v_result from public.point_submissions where id = v_result.id;
      end if;
    end if;
  end if;

  return v_result;
end;
$$;

-- How many people reported a missing machine at this store (and whether I did), so the
-- point card can ask others to confirm. Does not reveal who.
create function public.pending_machine_confirmations(p_store_id bigint)
returns table (users integer, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ps.user_id)::integer,
         coalesce(bool_or(ps.user_id = auth.uid()), false)
    from public.point_submissions ps
   where ps.kind = 'new_machine' and ps.store_id = p_store_id and ps.status = 'pending'
     and ps.created_at > now() - interval '30 days';
$$;

revoke execute on function public.pending_machine_confirmations(bigint) from public;
grant execute on function public.pending_machine_confirmations(bigint) to anon, authenticated;
