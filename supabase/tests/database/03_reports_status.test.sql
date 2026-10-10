begin;
select plan(34);

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com', 'authenticated', 'authenticated');

insert into public.stores (id, osm_type, osm_id, name, brand, shop, geom) overriding system value values
  (1001, 'node', 1, 'Lidl Centrum', 'Lidl', 'supermarket', public.make_point(52.2297, 21.0122)),
  (1002, 'node', 2, 'Żabka', 'Żabka', 'convenience', public.make_point(52.2310, 21.0122));

insert into public.machines (id, osm_type, osm_id, store_id, accepts, geom) overriding system value values
  (2001, 'node', 11, 1001, '{pet,can}', public.make_point(52.2297, 21.0122)),
  (2002, 'node', 12, null, '{glass}', public.make_point(52.2400, 21.0300)),
  (2003, 'node', 13, 1001, '{pet}', public.make_point(52.2297, 21.0123));

select is((select status::text from public.machine_status where machine_id = 2001), 'unknown',
          'new machine gets a grey status row from trigger');

-- ---------------------------------------------------------------- privileges
set local role anon;
select throws_ok($$ select public.report_machine(2001, 'full', 52.2300, 21.0122) $$,
                 '42501', null, 'anon cannot call report_machine');
select is((select count(*)::int from public.stores), 2, 'anon can read stores');
select is((select count(*)::int from public.machine_status_live), 3, 'anon can read live status');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$ insert into public.machine_reports (machine_id, user_id, type)
                    values (2001, '11111111-1111-1111-1111-111111111111', 'ok') $$,
                 '42501', null, 'reports cannot be inserted directly');
select throws_ok($$ update public.machine_status set status = 'ok' $$,
                 '42501', null, 'authenticated cannot write machine_status');
select throws_ok($$ insert into public.stores (name, geom) values ('x', public.make_point(1, 1)) $$,
                 '42501', null, 'authenticated cannot write stores');
select throws_ok($$ select public.recompute_machine_status(2001) $$,
                 '42501', null, 'recompute is internal');

reset role;
set local role service_role;
select throws_ok($$ update public.machine_status set status = 'ok' $$,
                 '42501', null, 'even service_role cannot write machine_status');
reset role;

-- ---------------------------------------------------------------- report_machine
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$ select public.report_machine(2001, 'full', 52.2330, 21.0122) $$,
                 'P0001', 'too_far', 'report from ~370 m is rejected');
select throws_ok($$ select public.report_machine(9999, 'full', 52.2300, 21.0122) $$,
                 'P0002', 'machine_not_found', 'unknown machine is rejected');
select throws_ok($$ select public.report_machine(2001, 'full', 95, 21.0122) $$,
                 '22023', 'invalid_location', 'invalid coordinates are rejected');

select is((select (public.report_machine(2001, 'full', 52.2300, 21.0122)).status::text), 'broken',
          'report "full" from ~33 m is accepted and returns red status');
select is((select report_type::text from public.machine_status where machine_id = 2001), 'full',
          'trigger stored report type');
select is((select valid_until from public.machine_status where machine_id = 2001), now() + interval '6 hours',
          'report is fresh for 6 h');
select is((select status::text from public.machine_status_live where machine_id = 2001), 'broken',
          'live status is red');
select throws_ok($$ select public.report_machine(2001, 'full', 52.2300, 21.0122) $$,
                 'P0001', 'duplicate_report', 'same report within an hour is a duplicate');
select is((select count(*)::int from public.machine_reports), 1, 'reporter sees own report');

-- ---------------------------------------------------------------- votes
select throws_ok(format($$ select public.vote_report(%s, true, 52.2300, 21.0122) $$,
                        (select report_id from public.machine_status where machine_id = 2001)),
                 'P0001', 'own_report', 'cannot confirm own report');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.machine_reports), 0, 'reports of others are not visible');
select throws_ok(format($$ select public.vote_report(%s, true, 52.2330, 21.0122) $$,
                        (select report_id from public.machine_status where machine_id = 2001)),
                 'P0001', 'too_far', 'vote from ~370 m is rejected');
select is((select (public.vote_report(ms.report_id, true, 52.2299, 21.0122)).confirmations
             from public.machine_status ms where machine_id = 2001), 1,
          'B confirms: 1 confirmation');

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select (public.vote_report(ms.report_id, false, 52.2299, 21.0122)).status::text
             from public.machine_status ms where machine_id = 2001), 'broken',
          'C denies: still red (1 + 1 - 1 > 0)');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select (public.vote_report(ms.report_id, false, 52.2299, 21.0122)).status::text
             from public.machine_status ms where machine_id = 2001), 'unknown',
          'B changes vote to "no longer": report refuted, status grey');

-- ---------------------------------------------------------------- newer report wins, fade-out
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select (public.report_machine(2001, 'ok', 52.2300, 21.0122)).status::text), 'ok',
          'new "ok" report turns the machine green');

reset role;
update public.machine_reports set created_at = now() - interval '7 hours'
 where id = (select report_id from public.machine_status where machine_id = 2001);
select is((select status::text || '/' || last_status::text from public.machine_status_live where machine_id = 2001),
          'unknown/ok', 'after 6 h without confirmation the pin fades to grey');

update public.machine_reports set created_at = now() - interval '5 hours'
 where id = (select report_id from public.machine_status where machine_id = 2001);
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select (public.vote_report(ms.report_id, true, 52.2299, 21.0122)).valid_until
             from public.machine_status ms where machine_id = 2001), now() + interval '6 hours',
          '"still" vote extends freshness by 6 h');

-- ---------------------------------------------------------------- hourly limit
reset role;
insert into public.machine_reports (machine_id, user_id, type, created_at)
select 2002, '11111111-1111-1111-1111-111111111111', 'queue', now() - interval '10 minutes'
  from generate_series(1, 9);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.report_machine(2003, 'off', 52.2300, 21.0122) $$,
                 'P0001', 'rate_limited', '11th report within an hour is rate limited');

-- ---------------------------------------------------------------- read RPCs
select is((select status::text from public.map_points(21.0, 52.2, 21.1, 52.3) where store_id = 1001), 'ok',
          'map point for store aggregates machine status');
select is((select accepts from public.map_points(21.0, 52.2, 21.1, 52.3) where store_id = 1001), '{pet,can}'::public.packaging[],
          'map point aggregates accepted packaging');
select is((select array_agg(kind || ':' || coalesce(store_id, machine_id) order by kind, coalesce(store_id, machine_id))
             from public.map_points(21.0, 52.2, 21.1, 52.3, p_only_working => true)),
          array['machine:2002', 'store:1001'],
          'only-working filter keeps green (store) and yellow (queue) points, drops grey');
select is((select array_agg(kind || ':' || coalesce(store_id, machine_id) order by kind, coalesce(store_id, machine_id))
             from public.map_points(21.0, 52.2, 21.1, 52.3, p_accepts => '{glass}')),
          array['machine:2002'], 'packaging filter (glass) finds the stand-alone machine');
select is((select array_agg(id order by distance_m) from public.nearest_stores(52.2300, 21.0122, 500, 5)),
          array[1001, 1002]::bigint[], 'nearest stores ordered by distance');
select is((select machine_count from public.nearest_stores(52.2300, 21.0122, 500, 5) where id = 1001), 2,
          'nearest_stores reports machine count');

select * from finish();
rollback;
