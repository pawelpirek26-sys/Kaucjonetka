begin;
select plan(2);
set local client_min_messages to warning;
truncate public.stores, public.machines restart identity cascade;

insert into public.stores (id, name, brand, geom) overriding system value values
  (1001, 'Lidl', 'Lidl', public.make_point(52.2297, 21.0122)),
  (1002, 'Żabka', 'Żabka', public.make_point(52.2310, 21.0122));
insert into public.machines (store_id, geom) values (1001, public.make_point(52.2297, 21.0122));

set local role anon;
select is((select array_agg(id order by id) from public.stores_by_ids(array[1002, 1001, 9999])),
          array[1001, 1002]::bigint[], 'returns known stores only');
select is((select machine_count from public.stores_by_ids(array[1001])), 1, 'includes machine count');
select * from finish();
rollback;
