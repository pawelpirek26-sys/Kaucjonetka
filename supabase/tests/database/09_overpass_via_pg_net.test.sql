begin;
select plan(7);

select ok(not has_function_privilege('anon', 'public.osm_overpass_request(text, text, text, integer)', 'execute'),
          'anon cannot send Overpass requests');
select ok(not has_function_privilege('authenticated', 'public.osm_overpass_request(text, text, text, integer)', 'execute'),
          'app users cannot send Overpass requests');
select ok(not has_function_privilege('authenticated', 'public.osm_overpass_response(bigint)', 'execute'),
          'app users cannot read Overpass responses');

set local role service_role;
select throws_ok($$ select public.osm_overpass_request('file:///etc/passwd', '[out:json];', 'test') $$,
                 '22023', 'invalid_request', 'only http(s) URLs');
select ok((select public.osm_overpass_request('http://127.0.0.1:9/api/interpreter', '[out:json];', 'test')) > 0,
          'request is queued in pg_net');
select is(public.osm_overpass_response(-1), null, 'pending or unknown request reads as null');
reset role;

-- a finished response is handed out once and then removed
insert into net._http_response (id, status_code, content, timed_out, created)
values (-42, 200, '{"elements":[]}', false, now());
set local role service_role;
select is(public.osm_overpass_response(-42),
          '{"status": 200, "error": null, "timed_out": false, "body": "{\"elements\":[]}"}'::jsonb,
          'response returned once');
reset role;

select * from finish();
rollback;
