begin;
select plan(11);
set local client_min_messages to warning;
truncate public.stores, public.machines restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com', 'authenticated', 'authenticated');
insert into public.stores (id, name, brand, geom) overriding system value values
  (1001, 'Biedronka', 'Biedronka', public.make_point(52.2297, 21.0122)),
  (1002, 'Lidl', 'Lidl', public.make_point(52.2400, 21.0122));
insert into public.machines (store_id, geom) values (1002, public.make_point(52.2400, 21.0122));

set local role authenticated;

-- first user: pending, visible as 1 confirmation
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select (public.submit_point('new_machine', 52.2298, 21.0122, p_store_id => 1001, p_accepts => '{pet}')).status::text),
          'pending', 'first report of a missing machine is pending');
select is((select row(users, mine)::text from public.pending_machine_confirmations(1001)), '(1,t)',
          'reporter sees 1 pending confirmation, own');
select throws_ok($$ select public.submit_point('new_machine', 52.2298, 21.0122, p_store_id => 1001) $$,
                 'P0001', 'duplicate_submission', 'the same user cannot confirm twice');

-- second user: auto-approved, machine created
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select row(users, mine)::text from public.pending_machine_confirmations(1001)), '(1,f)',
          'another user sees someone else''s pending report');
select is((select (public.submit_point('new_machine', 52.2299, 21.0122, p_store_id => 1001, p_accepts => '{can,pet}')).status::text),
          'approved', 'second distinct user approves it');
select is((select count(*)::int from public.machines_live where store_id = 1001), 1, 'exactly one machine created at the store');
select is((select row(source, accepts, status)::text from public.machines_live where store_id = 1001),
          '(user,"{pet,can}",unknown)', 'user machine with merged packaging and grey status');
select is((select machine_count from public.map_points(21.0, 52.2, 21.1, 52.3) where store_id = 1001), 1,
          'map shows the store with a machine');
select is((select row(users, mine)::text from public.pending_machine_confirmations(1001)), '(0,f)',
          'no pending confirmations left');

-- stores that already have a machine stay in moderation
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select public.submit_point('new_machine', 52.2401, 21.0122, p_store_id => 1002);
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select (public.submit_point('new_machine', 52.2401, 21.0122, p_store_id => 1002)).status::text),
          'pending', 'no auto-approval where a machine already exists');
reset role;
select is((select count(*)::int from public.machines where store_id = 1002), 1, 'no duplicate machine created');

select * from finish();
rollback;
