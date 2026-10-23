-- 010_publish_and_clock_reminders.sql — 2026-10-23 (owner request)
-- (1) PUBLISH: workers only see shifts in the current week (and earlier) automatically.
--     Any later week stays hidden from workers until the admin publishes it
--     (ac_roster_publish row for that week's Monday). Admin always sees everything.
--     Weeks are Monday–Sunday, Melbourne time.
-- (2) CLOCK REMINDERS: pushes 5, 10 and 30 min after a shift starts if the worker has not
--     clocked in, and 5, 10 and 30 min after it ends if they clocked in but not out.
--     Exactly once each (ac_shift_alert_log unique shift+kind). Cron moves to every minute.
-- The 24 h / 1 h "shift coming up" alerts now skip unpublished weeks, so they can't leak them.
begin;

create table if not exists public.ac_roster_publish (
  week_start date primary key,
  published_at timestamptz not null default now()
);
comment on table public.ac_roster_publish is 'One row per published roster week (Monday). Weeks after the current week are hidden from workers until a row exists.';
alter table public.ac_roster_publish enable row level security;
drop policy if exists rp_sel on public.ac_roster_publish;
drop policy if exists rp_ins on public.ac_roster_publish;
drop policy if exists rp_del on public.ac_roster_publish;
create policy rp_sel on public.ac_roster_publish for select to authenticated using (true);
create policy rp_ins on public.ac_roster_publish for insert to authenticated with check (ac_is_admin());
create policy rp_del on public.ac_roster_publish for delete to authenticated using (ac_is_admin());
revoke all on public.ac_roster_publish from anon;

create or replace function public.ac_week_visible(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select d < date_trunc('week', (now() at time zone 'Australia/Melbourne'))::date + 7
      or exists (select 1 from ac_roster_publish p where p.week_start = date_trunc('week', d)::date);
$$;
revoke execute on function public.ac_week_visible(date) from anon;

drop policy if exists s_sel on public.ac_shifts;
create policy s_sel on public.ac_shifts for select to authenticated
  using (ac_is_admin() or (worker_id = ac_my_worker_id() and ac_week_visible(date)));

create or replace function public.ac_shift_alert_candidates()
returns table(shift_id uuid, worker_id uuid, kind text, client text, address text, sdate date, start_t text, end_t text)
language sql security definer set search_path = public as $$
  with base as (
    select s.id, s.worker_id, c.name as client, c.address, s.date, s.start_t, s.end_t,
      (s.date::timestamp + (s.start_t || ':00')::time) as start_ts,
      (s.date::timestamp + (s.end_t || ':00')::time
        + case when (s.end_t || ':00')::time <= (s.start_t || ':00')::time then interval '1 day' else interval '0' end) as end_ts,
      (now() at time zone 'Australia/Melbourne') as nowm,
      exists (select 1 from ac_clock k where k.shift_id = s.id and k.kind = 'in')  as has_in,
      exists (select 1 from ac_clock k where k.shift_id = s.id and k.kind = 'out') as has_out
    from ac_shifts s
    join ac_clients c on c.id = s.client_id
    where s.worker_id is not null
      and s.date >= (now() at time zone 'Australia/Melbourne')::date - 2
      and ac_week_visible(s.date)
  ),
  k as (
    select * from (values
      ('24h', 'pre',  interval '-24 hours', interval '-20 hours'),
      ('1h',  'pre',  interval '-1 hour',   interval '0'),
      ('in5', 'in',   interval '5 minutes', interval '10 minutes'),
      ('in10','in',   interval '10 minutes',interval '30 minutes'),
      ('in30','in',   interval '30 minutes',interval '60 minutes'),
      ('out5','out',  interval '5 minutes', interval '10 minutes'),
      ('out10','out', interval '10 minutes',interval '30 minutes'),
      ('out30','out', interval '30 minutes',interval '60 minutes')
    ) v(kind, phase, a, b)
  )
  select b.id, b.worker_id, k.kind, b.client, b.address, b.date, b.start_t, b.end_t
  from base b cross join k
  where case k.phase
          when 'pre' then b.nowm >= b.start_ts + k.a and b.nowm < b.start_ts + k.b
          when 'in'  then not b.has_in and b.nowm >= b.start_ts + k.a and b.nowm < b.start_ts + k.b
          else b.has_in and not b.has_out and b.nowm >= b.end_ts + k.a and b.nowm < b.end_ts + k.b
        end
    and not exists (select 1 from ac_shift_alert_log l where l.shift_id = b.id and l.kind = k.kind);
$$;

select cron.alter_job((select jobid from cron.job where jobname = 'astar-shift-alerts'), schedule := '* * * * *');

commit;

-- ROLLBACK: restore s_sel = (ac_is_admin() OR worker_id = ac_my_worker_id()); drop table ac_roster_publish;
--           restore the 24h/1h-only ac_shift_alert_candidates (migration history) and schedule '*/10 * * * *'.

-- 010b (applied 2026-10-23): the alert log only allowed 24h/1h, which would have silently blocked the new kinds.
alter table public.ac_shift_alert_log drop constraint ac_shift_alert_log_kind_check;
alter table public.ac_shift_alert_log add constraint ac_shift_alert_log_kind_check check (kind = any (array['24h','1h','in5','in10','in30','out5','out10','out30']));
