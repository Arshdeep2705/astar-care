-- 001_verify.sql — proves the worker-row protection inside ONE transaction that is rolled
-- back, so nothing persists. Run as postgres. Expected output: a single row per check,
-- every `ok` = true.
begin;

-- apply the migration body (same statements as 001_worker_row_protection.sql)
create or replace function public.ac_workers_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.ac_is_admin() then return new; end if;
  if new.is_admin is distinct from old.is_admin or new.rates is distinct from old.rates
     or new.email is distinct from old.email or new.active is distinct from old.active
     or new.auth_uid is distinct from old.auth_uid or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'ac_workers: only an administrator can change admin status, rates, email, active or login link' using errcode = '42501';
  end if;
  return new;
end; $$;
drop trigger if exists ac_workers_protect_columns on public.ac_workers;
create trigger ac_workers_protect_columns before update on public.ac_workers for each row execute function public.ac_workers_protect_columns();

-- a synthetic worker (rolled back with everything else)
insert into public.ac_workers (id, name, email, colour, is_admin, active, auth_uid, rates)
values ('00000000-0000-4000-8000-00000000f001', 'Verify Worker', 'verify@example.invalid', '#000000', false, true, '00000000-0000-4000-8000-00000000a001', '{"weekday":1}'::jsonb);

-- impersonate that worker (what PostgREST does for an authenticated request)
-- NOTE: the temp table must be created and granted BEFORE this line (see below)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a001', true);

create temp table _r(check_name text, ok boolean, detail text) on commit drop;
grant all on _r to authenticated;   -- the impersonated role must be able to record results

-- 1. worker cannot promote themselves
do $$ begin
  update public.ac_workers set is_admin = true where auth_uid = auth.uid();
  insert into _r values ('worker cannot set is_admin', false, 'update succeeded');
exception when others then
  insert into _r values ('worker cannot set is_admin', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

-- 2. worker cannot change their pay rates
do $$ begin
  update public.ac_workers set rates = '{"weekday":999}' where auth_uid = auth.uid();
  insert into _r values ('worker cannot set rates', false, 'update succeeded');
exception when others then
  insert into _r values ('worker cannot set rates', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

-- 3. worker cannot re-point their login link or email
do $$ begin
  update public.ac_workers set email = 'other@example.invalid' where auth_uid = auth.uid();
  insert into _r values ('worker cannot set email', false, 'update succeeded');
exception when others then
  insert into _r values ('worker cannot set email', sqlstate = '42501', sqlstate || ' ' || sqlerrm);
end $$;

-- 4. worker CAN still clear must_change_password (first sign-in flow) and edit name/colour
do $$ begin
  update public.ac_workers set must_change_password = false, name = 'Verify Worker 2', colour = '#111111' where auth_uid = auth.uid();
  insert into _r values ('worker can update own profile fields', true, 'ok');
exception when others then
  insert into _r values ('worker can update own profile fields', false, sqlstate || ' ' || sqlerrm);
end $$;

-- 5. worker still cannot touch someone else's row (row policy, unchanged)
do $$ declare n int; begin
  update public.ac_workers set name = 'x' where auth_uid is distinct from auth.uid() and not is_admin;
  get diagnostics n = row_count;
  insert into _r values ('worker cannot update other rows', n = 0, n || ' rows affected');
exception when others then
  insert into _r values ('worker cannot update other rows', true, sqlstate || ' ' || sqlerrm);
end $$;

reset role;

-- 6. an admin (any row with is_admin = true) can still change rates
do $$ declare admin_uid uuid; begin
  select auth_uid into admin_uid from public.ac_workers where is_admin limit 1;
  perform set_config('request.jwt.claims', '{"sub":"' || admin_uid || '","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', admin_uid::text, true);
  set local role authenticated;
  update public.ac_workers set rates = '{"weekday":2}' where id = '00000000-0000-4000-8000-00000000f001';
  reset role;
  insert into _r values ('admin can still set rates', true, 'ok');
exception when others then
  reset role;
  insert into _r values ('admin can still set rates', false, sqlstate || ' ' || sqlerrm);
end $$;

select * from _r order by 1;

rollback;
