-- 002_evidence_and_roster_integrity.sql
-- Astar Care — evidence sources/observations/report versions, roster integrity RPCs,
-- 2:1 flag, blank-vs-zero fixes, evidence storage prefix policy.
-- Prepared 2026-09-07. NOT applied to production. Additive: no existing data is changed.
--
-- DEPLOY: run as postgres in the Supabase SQL editor, or `supabase db push`.
-- ROLLBACK: block at the end. All objects are new; dropping them restores the prior state.
-- VERIFY: migrations/tests/002_verify.sql (runs in a transaction and rolls back).

begin;

-- ---------------------------------------------------------------------------
-- A. Roster: intentional 2:1 (two workers on purpose) vs accidental overlap
-- ---------------------------------------------------------------------------
alter table public.ac_shifts add column if not exists two_to_one boolean not null default false;
comment on column public.ac_shifts.two_to_one is 'Set by the admin when a second worker is deliberately rostered for the same time (2:1). Unset overlaps are shown as clashes, never as 2:1.';

-- ---------------------------------------------------------------------------
-- B. Blank is not zero: allow "not recorded" on the structured logs.
--    Existing rows keep their values (a stored 0 stays 0 — see Summary methodology).
-- ---------------------------------------------------------------------------
alter table public.ac_care_logs
  alter column pad_wet drop not null, alter column pad_bowel drop not null, alter column bed_wet drop not null,
  alter column bedding_changes drop not null, alter column shower_prompts drop not null, alter column care_refusals drop not null,
  alter column transfers drop not null, alter column transfer_unsafe_alone drop not null;
alter table public.ac_care_logs
  alter column pad_wet drop default, alter column pad_bowel drop default, alter column bed_wet drop default,
  alter column bedding_changes drop default, alter column shower_prompts drop default, alter column care_refusals drop default,
  alter column transfers drop default, alter column transfer_unsafe_alone drop default;
alter table public.ac_overnight_logs alter column wakes drop not null, alter column wakes drop default;

-- ---------------------------------------------------------------------------
-- C. Transactional roster edits (the app previously did 2 REST calls that could half-succeed)
-- ---------------------------------------------------------------------------
-- Change a shift's date/times and move the adjoining shifts on the same client to the
-- same handover time, all in one transaction. Runs as the caller (RLS applies: s_upd = admin).
create or replace function public.ac_set_shift_times(p_shift uuid, p_date date, p_start text, p_end text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  s public.ac_shifts%rowtype;
  old_start timestamptz; old_end timestamptz;
  prev_id uuid; next_id uuid;
  n int;
begin
  select * into s from public.ac_shifts where id = p_shift for update;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  old_start := (s.date + s.start_t::time);
  old_end   := case when s.end_t::time <= s.start_t::time then (s.date + 1) + s.end_t::time else s.date + s.end_t::time end;
  -- neighbours are matched on the OLD boundaries, same client, and only when the date is unchanged
  if p_date = s.date then
    select id into prev_id from public.ac_shifts o where o.client_id = s.client_id and o.id <> s.id
      and (case when o.end_t::time <= o.start_t::time then (o.date + 1) + o.end_t::time else o.date + o.end_t::time end) = old_start limit 1;
    select id into next_id from public.ac_shifts o where o.client_id = s.client_id and o.id <> s.id
      and (o.date + o.start_t::time) = old_end limit 1;
  end if;
  update public.ac_shifts set date = p_date, start_t = p_start, end_t = p_end where id = p_shift;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not permitted to edit this shift' using errcode = '42501'; end if;
  if prev_id is not null and p_start <> s.start_t then update public.ac_shifts set end_t = p_start where id = prev_id; end if;
  if next_id is not null and p_end <> s.end_t then update public.ac_shifts set start_t = p_end where id = next_id; end if;
  return jsonb_build_object('shift', p_shift, 'prev', prev_id, 'next', next_id);
end; $$;

-- Split a shift at p_split: the original keeps [start, split), a new row covers [split, end).
create or replace function public.ac_split_shift(p_shift uuid, p_split text, p_worker uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.ac_shifts%rowtype; new_id uuid; n int;
begin
  select * into s from public.ac_shifts where id = p_shift for update;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  update public.ac_shifts set end_t = p_split where id = p_shift;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not permitted to edit this shift' using errcode = '42501'; end if;
  insert into public.ac_shifts (client_id, req_id, date, start_t, end_t, type, worker_id)
    values (s.client_id, s.req_id, s.date, p_split, s.end_t, s.type, p_worker) returning id into new_id;
  return jsonb_build_object('first', p_shift, 'second', new_id);
end; $$;

revoke all on function public.ac_set_shift_times(uuid, date, text, text) from public, anon;
revoke all on function public.ac_split_shift(uuid, text, uuid) from public, anon;
grant execute on function public.ac_set_shift_times(uuid, date, text, text) to authenticated;
grant execute on function public.ac_split_shift(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- D. Evidence sources, observations and report versions (Summary tab)
-- ---------------------------------------------------------------------------
create table if not exists public.ac_evidence_sources (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.ac_clients(id) on delete restrict,
  kind text not null check (kind in ('upload','note','incident','near_miss','care_log','overnight_log')),
  ref_id uuid,                                  -- the in-app record when kind <> 'upload'
  file_path text,                               -- storage path under evidence/<participant>/ when kind = 'upload'
  file_name text, mime text, size_bytes bigint, sha256 text,
  event_from date, event_to date,               -- the dates the source is ABOUT (never the upload time)
  author text,                                  -- original author as stated on the document
  title text, note text,
  text_content text,                            -- deterministic extraction (pdf.js / docx xml / plain text); null = not extracted
  extraction text not null default 'none' check (extraction in ('none','text','needs_ocr','manual')),
  excluded boolean not null default false,      -- e.g. training samples / generated examples
  excluded_reason text,
  uploaded_by uuid references public.ac_workers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists ac_evidence_sources_sha on public.ac_evidence_sources (participant_id, sha256) where sha256 is not null;
create index if not exists ac_evidence_sources_part on public.ac_evidence_sources (participant_id, event_from);

create table if not exists public.ac_evidence_observations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.ac_clients(id) on delete restrict,
  source_id uuid references public.ac_evidence_sources(id) on delete cascade,
  source_ref text,                              -- page / section / quoted text that supports this row
  obs_date date not null,                       -- local (participant service) date the event STARTED
  start_time text, end_time text,               -- HH:MM local; end may be after midnight of obs_date
  timing text not null default 'estimated' check (timing in ('exact','estimated','interval')),
  category text not null check (category in ('overnight_assist','overnight_awake_no_assist','overnight_supervision','daytime_task','incident','near_miss','other')),
  assist_type text, reason text, outcome text,
  workers_involved int check (workers_involved is null or workers_involved between 0 and 4),
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected')),
  duplicate_of uuid references public.ac_evidence_observations(id),
  reviewer text, reviewed_at timestamptz, review_note text,
  created_by uuid references public.ac_workers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists ac_evidence_obs_part on public.ac_evidence_observations (participant_id, obs_date);

create table if not exists public.ac_report_versions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.ac_clients(id) on delete restrict,
  period_from date not null, period_to date not null,
  status text not null default 'draft' check (status in ('draft','final')),
  calc_version text not null,                   -- app build + metric definitions version
  snapshot jsonb not null,                      -- the frozen dataset + computed figures
  source_ids uuid[] not null default '{}', observation_ids uuid[] not null default '{}',
  reviewer text, finalised_at timestamptz,
  pdf_path text,                                -- storage path of the exported report, when saved
  created_by uuid references public.ac_workers(id),
  created_at timestamptz not null default now()
);

alter table public.ac_evidence_sources enable row level security;
alter table public.ac_evidence_observations enable row level security;
alter table public.ac_report_versions enable row level security;
-- evidence is an admin-only workspace (participant documents, clinical references, report drafts)
create policy ev_src_admin on public.ac_evidence_sources for all to authenticated using (public.ac_is_admin()) with check (public.ac_is_admin());
create policy ev_obs_admin on public.ac_evidence_observations for all to authenticated using (public.ac_is_admin()) with check (public.ac_is_admin());
create policy ev_rep_admin on public.ac_report_versions for all to authenticated using (public.ac_is_admin()) with check (public.ac_is_admin());
revoke all on public.ac_evidence_sources, public.ac_evidence_observations, public.ac_report_versions from anon;
grant select, insert, update, delete on public.ac_evidence_sources, public.ac_evidence_observations to authenticated;
grant select, insert, update on public.ac_report_versions to authenticated;   -- versions are never deleted from the app

-- a finalised report version is immutable (later uploads cannot change it)
create or replace function public.ac_report_versions_freeze() returns trigger language plpgsql as $$
begin
  if old.status = 'final' then raise exception 'a finalised report version cannot be changed' using errcode = '42501'; end if;
  return new;
end; $$;
drop trigger if exists ac_report_versions_freeze on public.ac_report_versions;
create trigger ac_report_versions_freeze before update or delete on public.ac_report_versions for each row execute function public.ac_report_versions_freeze();

-- ---------------------------------------------------------------------------
-- E. Storage: reuse bucket ac-files, but the evidence/ prefix is admin-only.
--    Replaces the single "any authenticated user, any object" policy with two.
-- ---------------------------------------------------------------------------
drop policy if exists ac_files_auth on storage.objects;
create policy ac_files_general on storage.objects for all to authenticated
  using (bucket_id = 'ac-files' and (storage.foldername(name))[1] is distinct from 'evidence')
  with check (bucket_id = 'ac-files' and (storage.foldername(name))[1] is distinct from 'evidence');
create policy ac_files_evidence_admin on storage.objects for all to authenticated
  using (bucket_id = 'ac-files' and (storage.foldername(name))[1] = 'evidence' and public.ac_is_admin())
  with check (bucket_id = 'ac-files' and (storage.foldername(name))[1] = 'evidence' and public.ac_is_admin());

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- begin;
--   drop policy if exists ac_files_general on storage.objects;
--   drop policy if exists ac_files_evidence_admin on storage.objects;
--   create policy ac_files_auth on storage.objects for all to authenticated using (bucket_id = 'ac-files') with check (bucket_id = 'ac-files');
--   drop table if exists public.ac_report_versions; drop function if exists public.ac_report_versions_freeze();
--   drop table if exists public.ac_evidence_observations; drop table if exists public.ac_evidence_sources;
--   drop function if exists public.ac_split_shift(uuid, text, uuid); drop function if exists public.ac_set_shift_times(uuid, date, text, text);
--   alter table public.ac_shifts drop column if exists two_to_one;
--   -- (B) is left as-is on rollback: nullable columns are harmless and the app handles null.
-- commit;
-- ---------------------------------------------------------------------------
