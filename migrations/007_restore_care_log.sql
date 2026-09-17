-- 007 (APPLIED 2026-09-17): restore the personal care log, reversing 006 exactly.
-- Owner clarified: pad changes, bedding, refusals and transfers stay as Summary evidence;
-- only the SHOWER questions are retired (in the app build; the shower columns stay for old rows).
alter table public.ac_care_logs_archive_20260917 rename to ac_care_logs;
comment on table public.ac_care_logs is 'Personal care log, one per shift (pad changes, bedding, refusals, transfers). Shower questions retired 2026-09-17; columns kept for old rows.';
create policy cl_sel on public.ac_care_logs for select to authenticated using (ac_is_admin() or worker_id = ac_my_worker_id());
create policy cl_ins on public.ac_care_logs for insert to authenticated with check (ac_is_admin() or worker_id = ac_my_worker_id());
create policy cl_upd on public.ac_care_logs for update to authenticated using (ac_is_admin() or worker_id = ac_my_worker_id());
create policy cl_del on public.ac_care_logs for delete to authenticated using (ac_is_admin() or worker_id = ac_my_worker_id());
