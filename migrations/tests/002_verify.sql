-- 002_verify.sql — applies 002 inside a transaction, exercises it with synthetic rows,
-- prints one row per check, then ROLLS BACK. Nothing persists. Run as postgres.
begin;
-- paste the BODY of migrations/002_evidence_and_roster_integrity.sql here (everything between its begin; and commit;)

create temp table _r(check_name text, ok boolean, detail text) on commit drop;
grant all on _r to authenticated;

-- synthetic participant + shifts (rolled back)
insert into public.ac_clients (id, name, address, colour) values ('00000000-0000-4000-8000-0000000000c1', 'Verify Participant', '1 Test St', '#123456');
insert into public.ac_shifts (id, client_id, date, start_t, end_t, type) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '2030-01-01', '09:00', '18:00', 'day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', '2030-01-01', '18:00', '09:00', 'sleepover'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c1', '2030-01-02', '09:00', '18:00', 'day');

-- run as the admin
do $$ declare admin_uid uuid; begin
  select auth_uid into admin_uid from public.ac_workers where is_admin limit 1;
  perform set_config('request.jwt.claims', '{"sub":"' || admin_uid || '","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
end $$;
set local role authenticated;

-- 1. handover rule in one transaction: sleepover now ends 10:30 → next day shift starts 10:30
do $$ declare j jsonb; s3 text; begin
  j := public.ac_set_shift_times('00000000-0000-4000-8000-0000000000a2', '2030-01-01', '18:00', '10:30');
  select start_t into s3 from public.ac_shifts where id = '00000000-0000-4000-8000-0000000000a3';
  insert into _r values ('1 set_shift_times moves the next shift to the handover time', s3 = '10:30', 'next start=' || s3 || ' ' || j::text);
exception when others then insert into _r values ('1 set_shift_times moves the next shift', false, sqlstate || ' ' || sqlerrm); end $$;

-- 2. split is atomic: original ends at split, new row starts at split
do $$ declare j jsonb; e1 text; s2 text; n int; begin
  j := public.ac_split_shift('00000000-0000-4000-8000-0000000000a1', '13:00', null);
  select end_t into e1 from public.ac_shifts where id = '00000000-0000-4000-8000-0000000000a1';
  select start_t into s2 from public.ac_shifts where id = (j->>'second')::uuid;
  select count(*) into n from public.ac_shifts where client_id = '00000000-0000-4000-8000-0000000000c1' and date = '2030-01-01' and type = 'day';
  insert into _r values ('2 split_shift is atomic', e1 = '13:00' and s2 = '13:00' and n = 2, 'first end=' || e1 || ' second start=' || s2 || ' parts=' || n);
exception when others then insert into _r values ('2 split_shift is atomic', false, sqlstate || ' ' || sqlerrm); end $$;

-- 3. evidence tables: admin can insert; a finalised version cannot be changed
do $$ declare vid uuid; begin
  insert into public.ac_evidence_sources (participant_id, kind, title, sha256) values ('00000000-0000-4000-8000-0000000000c1', 'upload', 'OT report (synthetic)', 'abc') ;
  insert into public.ac_report_versions (participant_id, period_from, period_to, status, calc_version, snapshot, reviewer, finalised_at)
    values ('00000000-0000-4000-8000-0000000000c1', '2030-01-01', '2030-01-31', 'final', 'metrics-v2', '{"falls":0}', 'Verifier', now()) returning id into vid;
  begin
    update public.ac_report_versions set snapshot = '{"falls":99}' where id = vid;
    insert into _r values ('3 finalised report version is immutable', false, 'update succeeded');
  exception when others then insert into _r values ('3 finalised report version is immutable', sqlstate = '42501', sqlstate || ' ' || sqlerrm); end;
end $$;

-- 4. duplicate upload (same participant + sha256) is rejected
do $$ begin
  insert into public.ac_evidence_sources (participant_id, kind, title, sha256) values ('00000000-0000-4000-8000-0000000000c1', 'upload', 'same file again', 'abc');
  insert into _r values ('4 exact duplicate file rejected', false, 'insert succeeded');
exception when unique_violation then insert into _r values ('4 exact duplicate file rejected', true, 'unique_violation');
when others then insert into _r values ('4 exact duplicate file rejected', false, sqlstate || ' ' || sqlerrm); end $$;

-- 5. a plain worker sees no evidence rows and cannot insert
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
insert into public.ac_workers (id, name, email, colour, auth_uid) values ('00000000-0000-4000-8000-00000000f001','Verify Worker','verify@example.invalid','#000','00000000-0000-4000-8000-00000000a001');
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.ac_evidence_sources;
  insert into _r values ('5a worker sees no evidence sources', n = 0, n || ' visible');
  begin
    insert into public.ac_evidence_observations (participant_id, obs_date, category) values ('00000000-0000-4000-8000-0000000000c1', '2030-01-01', 'other');
    insert into _r values ('5b worker cannot add observations', false, 'insert succeeded');
  exception when others then insert into _r values ('5b worker cannot add observations', true, sqlstate || ' ' || sqlerrm); end;
end $$;
reset role;

-- 6. blank-is-not-zero: null counts are accepted on care logs
do $$ begin
  insert into public.ac_care_logs (shift_id, participant_id, pad_wet, transfers) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', null, 3);
  insert into _r values ('6 care log accepts null (not recorded)', true, 'ok');
exception when others then insert into _r values ('6 care log accepts null (not recorded)', false, sqlstate || ' ' || sqlerrm); end $$;

select * from _r order by 1;
rollback;
