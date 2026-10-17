begin;
select plan(1);

-- Every foreign key in public has an index whose leading columns are the FK columns.
select is(
  (select array_agg(c.conrelid::regclass || '.' || c.conname order by 1)
     from pg_constraint c
     join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
         where i.indrelid = c.conrelid
           and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
           and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)),
  null,
  'every public foreign key has a covering index');

select * from finish();
rollback;
