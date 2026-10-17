-- Kaucjomat: Overpass requests leave through the database (pg_net) instead of the Edge
-- Function. overpass-api.de refuses Edge Function egress IPs (406, dropped connections)
-- but serves the database's. The import-osm function still builds the query and parses
-- the result; it only asks these two service_role functions to do the HTTP call.

create function public.osm_overpass_request(
  p_url text,
  p_query text,
  p_user_agent text,
  p_timeout_ms integer default 120000
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_url is null or p_url !~ '^https?://' or coalesce(p_query, '') = '' then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  return net.http_get(
    url := p_url,
    params := jsonb_build_object('data', p_query),
    headers := jsonb_build_object('User-Agent', coalesce(p_user_agent, 'Kaucjomat')),
    timeout_milliseconds := least(greatest(coalesce(p_timeout_ms, 120000), 1000), 180000)
  );
end;
$$;

-- Returns null while the request is still in flight; afterwards the response once
-- (it is removed from net._http_response, Overpass answers are large).
create function public.osm_overpass_response(p_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  delete from net._http_response where id = p_request_id
  returning status_code, error_msg, timed_out, content into r;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'status', r.status_code, 'error', r.error_msg, 'timed_out', coalesce(r.timed_out, false), 'body', r.content);
end;
$$;

revoke execute on function public.osm_overpass_request(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.osm_overpass_response(bigint) from public, anon, authenticated;
grant execute on function public.osm_overpass_request(text, text, text, integer) to service_role;
grant execute on function public.osm_overpass_response(bigint) to service_role;
