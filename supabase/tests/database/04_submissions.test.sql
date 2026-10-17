begin;
select plan(7);

-- independent of whatever the local database already holds (rolled back at the end)
set local client_min_messages to warning;
truncate public.stores, public.machines, public.osm_import_runs restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated');
insert into public.stores (id, name, brand, geom) overriding system value values
  (1001, 'Biedronka', 'Biedronka', public.make_point(52.2297, 21.0122));

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$ select public.submit_point('correction', 52.2297, 21.0122) $$,
                 '22023', 'target_required', 'correction needs a target');
select throws_ok($$ select public.submit_point('new_machine', 52.2330, 21.0122, p_store_id => 1001) $$,
                 'P0001', 'too_far', 'submitting for a store from ~370 m is rejected');
select is((select (public.submit_point('new_machine', 52.2298, 21.0122, p_store_id => 1001,
                                       p_accepts => '{pet,can}')).status::text),
          'pending', 'new machine submission is pending');
select is((select count(*)::int from public.point_submissions), 1, 'user sees own submission');

select public.submit_point('new_store', 52.2298, 21.0122, p_name => 'Sklep ' || g)
  from generate_series(1, 4) g;
select throws_ok($$ select public.submit_point('new_store', 52.2298, 21.0122) $$,
                 'P0001', 'rate_limited', '6th submission within an hour is rate limited');

select throws_ok($$ select public.review_point_submission(1, true) $$, '42501', null,
                 'users cannot moderate');

reset role;
set local role service_role;
select public.review_point_submission(
  (select id from public.point_submissions where kind = 'new_machine'), true);
select is((select store_id from public.machines where source = 'user'), 1001::bigint,
          'approved machine is linked to the store');

select * from finish();
rollback;
