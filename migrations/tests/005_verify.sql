-- 005_verify.sql — applies 005 inside a transaction, checks it with synthetic rows, ROLLS BACK.
begin;
-- paste the BODY of migrations/005_summary_analytics.sql here (between its begin; and commit;)

create temp table _r(check_name text, ok boolean, detail text) on commit drop;
grant all on _r to authenticated;
insert into public.ac_clients (id, name, address, colour) values ('00000000-0000-4000-8000-0000000000c5', 'Verify Participant', '1 Test St', '#123456');
insert into public.ac_shifts (id, client_id, date, start_t, end_t, type) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c5', '2030-01-07', '18:00', '09:00', 'sleepover'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c5', '2030-01-08', '09:00', '18:00', 'day');
do $$ declare admin_uid uuid; begin
  select auth_uid into admin_uid from public.ac_workers where is_admin limit 1;
  perform set_config('request.jwt.claims', '{"sub":"' || admin_uid || '","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
end $$;
set local role authenticated;

-- 1. Monday 18:00–09:00 split at 03:00 → second segment dated Tuesday
do $$ declare j jsonb; d date; begin
  j := public.ac_split_shift('00000000-0000-4000-8000-0000000000b1', '03:00', null);
  select date into d from public.ac_shifts where id = (j->>'second')::uuid;
  insert into _r values ('1 overnight split after midnight lands on the next day', d = date '2030-01-08', 'second date=' || d);
exception when others then insert into _r values ('1 overnight split after midnight lands on the next day', false, sqlstate || ' ' || sqlerrm); end $$;

-- 2. a split outside the shift is refused by the database
do $$ begin
  perform public.ac_split_shift('00000000-0000-4000-8000-0000000000b2', '20:00', null);
  insert into _r values ('2 split outside the shift is refused', false, 'succeeded');
exception when others then insert into _r values ('2 split outside the shift is refused', sqlstate = '22023', sqlstate || ' ' || sqlerrm); end $$;

-- 3. shower completion can be unanswered
do $$ begin
  insert into public.ac_care_logs (shift_id, participant_id, shower_offered, shower_done, transfers) values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c5', true, null, 2);
  insert into _r values ('3 shower_done accepts null (outcome not recorded)', true, 'ok');
exception when others then insert into _r values ('3 shower_done accepts null', false, sqlstate || ' ' || sqlerrm); end $$;

-- 4. an observation can point at the structured record it repeats
do $$ declare iid uuid; begin
  insert into public.ac_incident_forms (participant_id, shift_id, incident_date, incident_time, is_fall, incident_types, injuries, staff_name, ticket_name, ticket_desc) values ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000b2', '2030-01-08', '10:00', true, array['Injury'], 'No', 'v', 'v', 'synthetic') returning id into iid;
  insert into public.ac_evidence_observations (participant_id, obs_date, category, status, duplicate_of_record) values ('00000000-0000-4000-8000-0000000000c5', '2030-01-08', 'incident', 'accepted', iid);
  insert into _r values ('4 duplicate_of_record links to a structured record', true, 'ok');
exception when others then insert into _r values ('4 duplicate_of_record links to a structured record', false, sqlstate || ' ' || sqlerrm); end $$;
reset role;
select * from _r order by 1;
rollback;
