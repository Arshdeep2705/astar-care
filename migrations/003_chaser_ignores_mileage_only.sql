-- 003_chaser_ignores_mileage_only.sql
-- The missing-note chaser treated ANY ac_note_entries row (including a Mileage-only entry)
-- as the shift note. A mileage record is a separate record type; the shift note is the
-- Progress Notes entry. Prepared 2026-09-07, NOT applied. Additive change to one function.
-- The app's own "outstanding notes" views were changed the same way in the same release.
begin;
create or replace function public.ac_chaser_candidates()
returns table(shift_id uuid, worker_id uuid, client text, sdate date, start_t text, end_t text)
language sql security definer set search_path = public as $$
  select s.id, s.worker_id, c.name, s.date, s.start_t, s.end_t
  from ac_shifts s
  join ac_clients c on c.id = s.client_id
  where s.worker_id is not null
    and not s.note_waived
    and s.date >= '2026-08-25'
    and not exists (select 1 from ac_note_entries n where n.shift_id = s.id and n.note_type <> 'Mileage')
    and (s.date::timestamp + (s.end_t || ':00')::time
         + case when (s.end_t || ':00')::time <= (s.start_t || ':00')::time then interval '1 day' else interval '0 hours' end)
        between (now() at time zone 'Australia/Melbourne') - interval '48 hours'
            and (now() at time zone 'Australia/Melbourne')
    and not exists (select 1 from ac_chaser_log l where l.shift_id = s.id and l.sent_at > now() - interval '115 minutes')
$$;
commit;
-- ROLLBACK: re-create the function without the `and n.note_type <> 'Mileage'` clause.
