-- 005_summary_analytics.sql — prepared 2026-09-09, NOT applied.
-- (a) reviewed observations can point at the structured record they repeat (counted once);
-- (b) shower completion can be "not answered" (null) instead of forced to false;
-- (c) ac_split_shift dates the second segment correctly for overnight splits and validates
--     that the split time lies inside the shift, in the database, not only in the browser.
-- No historical data is changed. two_to_one, second_person_needed and single_worker_capacity
-- columns are kept for historical rows; the app no longer asks or reports on them.
begin;

alter table public.ac_evidence_observations add column if not exists duplicate_of_record uuid;
comment on column public.ac_evidence_observations.duplicate_of_record is 'The incident report / near miss record this observation repeats. Linked observations are references, never counted.';

alter table public.ac_care_logs alter column shower_done drop not null;
alter table public.ac_care_logs alter column shower_done drop default;
comment on column public.ac_care_logs.shower_done is 'true = done, false = declined, null = outcome not recorded';

create or replace function public.ac_split_shift(p_shift uuid, p_split text, p_worker uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.ac_shifts%rowtype; new_id uuid; n int; st time; en time; sp time; crosses boolean; inside boolean; seg_date date;
begin
  select * into s from public.ac_shifts where id = p_shift for update;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  st := s.start_t::time; en := s.end_t::time; sp := p_split::time;
  crosses := en <= st;
  inside := case when crosses then (sp > st or sp < en) else (sp > st and sp < en) end;
  if not inside then raise exception 'split time % is not inside the shift %–%', p_split, s.start_t, s.end_t using errcode = '22023'; end if;
  seg_date := case when crosses and sp < st then s.date + 1 else s.date end;
  update public.ac_shifts set end_t = p_split where id = p_shift;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not permitted to edit this shift' using errcode = '42501'; end if;
  insert into public.ac_shifts (client_id, req_id, date, start_t, end_t, type, worker_id)
    values (s.client_id, s.req_id, seg_date, p_split, s.end_t, s.type, p_worker) returning id into new_id;
  return jsonb_build_object('first', p_shift, 'second', new_id, 'second_date', seg_date);
end; $$;

commit;

-- VERIFY (roll back): tests/005_verify.sql
-- ROLLBACK: alter table ac_evidence_observations drop column duplicate_of_record;
--           alter table ac_care_logs alter column shower_done set default false; (then set not null after backfilling nulls)
--           re-create ac_split_shift from 002 (same-date second segment).
