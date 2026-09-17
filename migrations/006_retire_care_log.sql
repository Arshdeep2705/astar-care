-- 006: retire the personal care log (owner decision 2026-09-17).
-- Workers record pad changes, showers and transfers inside the shift note, and the separate
-- structured form was rarely filled, so the app no longer reads, writes or reports it.
-- The table is ARCHIVED rather than dropped: the existing rows stay in the database for reference,
-- every policy is removed so the API cannot read or write them, and the name makes the status obvious.
-- To delete the archive for good (irreversible):  drop table public.ac_care_logs_archive_20260917;

drop policy if exists cl_sel on public.ac_care_logs;
drop policy if exists cl_ins on public.ac_care_logs;
drop policy if exists cl_upd on public.ac_care_logs;
drop policy if exists cl_del on public.ac_care_logs;

alter table public.ac_care_logs rename to ac_care_logs_archive_20260917;
comment on table public.ac_care_logs_archive_20260917 is
  'Retired 2026-09-17. Personal care log rows kept for reference only; the app no longer uses them. Safe to drop.';
