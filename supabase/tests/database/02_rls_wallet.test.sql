begin;
select plan(12);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'authenticated', 'authenticated', '{"full_name":"Ala"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'authenticated', 'authenticated', '{}');

select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          'Ala', 'profile created by auth trigger with display name');

-- user A
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.coupons (id, amount_grosze, expires_on)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 350, current_date + 14)
$$, 'owner can insert a coupon (user_id defaults to auth.uid())');

select throws_ok($$
  insert into public.coupons (id, user_id, amount_grosze)
  values ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 100)
$$, '42501', null, 'cannot insert a coupon for another user');

select throws_ok($$
  insert into public.coupons (id, amount_grosze) values ('aaaaaaaa-0000-0000-0000-000000000003', -5)
$$, '23514', null, 'negative amount rejected');

select is((select count(*)::int from public.coupons), 1, 'owner sees own coupon');

select lives_ok($$ update public.profiles set backup_enabled = true $$, 'owner can enable backup');
select throws_ok($$ update public.profiles set id = gen_random_uuid() $$, '42501', null,
                 'profile id is not updatable');

-- user B
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.coupons), 0, 'other user sees no coupons');
select is((select count(*)::int from public.profiles), 1, 'other user sees only own profile');

update public.coupons set amount_grosze = 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.coupons where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- anon
reset role;
set local role anon;
select throws_ok($$ select * from public.coupons $$, '42501', null, 'anon has no access to coupons');

reset role;
select is((select amount_grosze from public.coupons where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          350, 'other user could neither update nor delete the coupon');

-- last-write-wins on client timestamp
update public.coupons set amount_grosze = 999, client_updated_at = now() - interval '1 day'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select amount_grosze from public.coupons where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          350, 'stale client update is ignored');

select * from finish();
rollback;
