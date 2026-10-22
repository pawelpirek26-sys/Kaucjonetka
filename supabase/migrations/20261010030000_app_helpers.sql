-- Kaucjomat: helpers used by the mobile app.

-- Store details for a set of ids (rebuilding the on-device store cache after a backup restore).
create function public.stores_by_ids(p_ids bigint[])
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
  machine_count integer,
  machine_id bigint
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.name, s.brand, s.shop, s.street, s.housenumber, s.city,
         extensions.st_y(s.geom::extensions.geometry),
         extensions.st_x(s.geom::extensions.geometry),
         coalesce(m.cnt, 0)::integer,
         m.first_id
    from public.stores s
    left join lateral (
      select count(*) as cnt, min(mm.id) as first_id
        from public.machines mm
       where mm.store_id = s.id and mm.active
    ) m on true
   where s.id = any (p_ids[1:200]);
$$;
