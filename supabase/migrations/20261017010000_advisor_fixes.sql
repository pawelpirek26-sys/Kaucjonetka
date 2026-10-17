-- Kaucjomat: fixes reported by the Supabase database advisors after the first deploy.

-- Foreign keys without a covering index (lint 0001). point_submissions.store_id is also
-- what submit_point's auto-approval and pending_machine_confirmations filter on.
create index point_submissions_store_id_idx on public.point_submissions (store_id);
create index point_submissions_machine_id_idx on public.point_submissions (machine_id);
-- deleting a report sets machine_status.report_id to null
create index machine_status_report_id_idx on public.machine_status (report_id);

-- Hosted projects with "auto-enable RLS" get an event-trigger function in public that is
-- executable by anon/authenticated (lint 0028/0029). Event triggers do not need EXECUTE,
-- so take it away from API roles. The function does not exist on a local stack.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
