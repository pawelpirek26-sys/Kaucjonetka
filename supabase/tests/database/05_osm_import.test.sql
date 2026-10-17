begin;
select plan(10);

-- independent of whatever the local database already holds (rolled back at the end)
set local client_min_messages to warning;
truncate public.stores, public.machines, public.osm_import_runs restart identity cascade;

-- Lidl (supermarket) and Żabka (convenience) ~122 m apart; the machine stands 75 m from
-- Lidl and 48 m from Żabka, so the supermarket bonus (50 m) links it to Lidl.
create temp table payload as select
  '[{"osm_type":"node","osm_id":1,"lat":52.2297,"lon":21.0122,"name":"Lidl","brand":"Lidl","shop":"supermarket"},
    {"osm_type":"node","osm_id":2,"lat":52.2297,"lon":21.0140,"name":"Żabka","brand":"Żabka","shop":"convenience"},
    {"osm_type":"way","osm_id":3,"lat":52.3000,"lon":21.1000,"name":"Stara Biedronka","brand":"Biedronka","shop":"supermarket"}]'::jsonb as stores,
  '[{"osm_type":"node","osm_id":11,"lat":52.2297,"lon":21.0133,"accepts":["pet","can"]},
    {"osm_type":"node","osm_id":12,"lat":52.4000,"lon":21.2000,"accepts":[]}]'::jsonb as machines;
grant select on payload to authenticated, service_role;

set local role authenticated;
select throws_ok($$ select public.import_osm_region('PL-MZ', (select stores from payload), (select machines from payload)) $$,
                 '42501', null, 'app users cannot import');
reset role;

set local role service_role;
select throws_ok($$ select public.import_osm_region('PL-XX', '[]', '[]') $$,
                 '22023', 'unknown_region', 'unknown region rejected');
select is((select public.import_osm_region('PL-MZ', stores, machines) from payload),
          '{"stores": 3, "machines": 2, "linked": 1, "stores_deactivated": 0, "machines_deactivated": 0}'::jsonb,
          'first import upserts 3 stores, 2 machines, links 1');
reset role;

select is((select s.name from public.machines m join public.stores s on s.id = m.store_id where m.osm_id = 11),
          'Lidl', 'machine linked to the supermarket thanks to the 50 m bonus');
select is((select status::text from public.machine_status ms join public.machines m on m.id = ms.machine_id where m.osm_id = 11),
          'unknown', 'imported machine starts grey');
select is((select accepts from public.machines where osm_id = 11), '{pet,can}'::public.packaging[],
          'packaging array imported');

-- Second run a few weeks later: Biedronka (osm way 3) is gone from OSM.
update public.stores set last_seen_at = now() - interval '20 days' where osm_id = 3;
set local role service_role;
select is((select (public.import_osm_region('PL-MZ',
             '[{"osm_type":"node","osm_id":1,"lat":52.2297,"lon":21.0122,"name":"Lidl Centrum","brand":"Lidl","shop":"supermarket"}]',
             '[]')) ->> 'stores_deactivated'), '1', 'store missing for 15+ days is deactivated');
reset role;
select is((select name from public.stores where osm_type = 'node' and osm_id = 1), 'Lidl Centrum',
          're-import updates attributes in place');
select is((select count(*)::int from public.osm_import_runs where region = 'PL-MZ'), 2, 'each run is logged');

delete from vault.secrets where name like 'kaucjomat_%';
select is(public.osm_import_next_region(), null, 'scheduler is a no-op without Vault secrets');

select * from finish();
rollback;
