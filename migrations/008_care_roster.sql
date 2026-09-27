-- 008_care_roster.sql — 2026-09-27
-- Roster of care: the PLANNED supports per the service agreement, kept separate from the
-- worker roster (ac_shifts). Admin-only — workers never see it. No worker column by design.
-- Additive: no existing table or row is changed.
begin;

create table if not exists public.ac_care_roster (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.ac_clients(id) on delete cascade,
  req_id uuid references public.ac_reqs(id) on delete set null,
  date date not null,
  start_t text not null,
  end_t text not null,
  type text not null default 'day',
  created_at timestamptz not null default now()
);
comment on table public.ac_care_roster is 'Roster of care (planned supports per the service agreement). Admin-only. Independent of ac_shifts, which is what workers see and work.';
create index if not exists ac_care_roster_date_idx on public.ac_care_roster (date);
create index if not exists ac_care_roster_client_date_idx on public.ac_care_roster (client_id, date);

alter table public.ac_care_roster enable row level security;
create policy cr_sel on public.ac_care_roster for select to authenticated using (ac_is_admin());
create policy cr_ins on public.ac_care_roster for insert to authenticated with check (ac_is_admin());
create policy cr_upd on public.ac_care_roster for update to authenticated using (ac_is_admin()) with check (ac_is_admin());
create policy cr_del on public.ac_care_roster for delete to authenticated using (ac_is_admin());
revoke all on public.ac_care_roster from anon;

commit;

-- ROLLBACK: drop table public.ac_care_roster;
