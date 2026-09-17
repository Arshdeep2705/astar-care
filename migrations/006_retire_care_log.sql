-- 006 (APPLIED 2026-09-17 12:59, then REVERSED by 007 the same hour — kept for an honest history).
-- Archived the personal care log on a misread of the owner's instruction: the owner only wanted the
-- SHOWER questions removed. Do not run again.
drop policy if exists cl_sel on public.ac_care_logs;
drop policy if exists cl_ins on public.ac_care_logs;
drop policy if exists cl_upd on public.ac_care_logs;
drop policy if exists cl_del on public.ac_care_logs;
alter table public.ac_care_logs rename to ac_care_logs_archive_20260917;
