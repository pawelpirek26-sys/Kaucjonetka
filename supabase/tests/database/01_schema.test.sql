begin;
select plan(16);

select has_table('public', t, format('table %s exists', t))
  from unnest(array['stores','machines','machine_reports','report_votes','machine_status',
                    'coupons','point_submissions','profiles']) t;

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select is(
  (select array_agg(tablename::text order by tablename) from pg_indexes
    where schemaname = 'public' and indexdef ilike '%using gist (geom)%'),
  array['machines','point_submissions','stores'],
  'GiST index on every point geometry');

select col_type_is('public', 'coupons', 'amount_grosze', 'integer', 'coupon amounts are integer grosze');
select col_type_is('public', 'stores', 'geom', 'extensions.geography(Point,4326)', 'stores.geom is geography point');
select col_type_is('public', 'machines', 'geom', 'extensions.geography(Point,4326)', 'machines.geom is geography point');

select enum_has_labels('public', 'report_type', array['ok','full','rejects','no_print','off','queue'], 'report types');
select enum_has_labels('public', 'coupon_status', array['active','redeemed','expired'], 'coupon statuses');

select has_function('public', 'report_machine', array['bigint','report_type','double precision','double precision'], 'report RPC exists');

select * from finish();
rollback;
