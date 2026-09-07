-- 001_worker_row_protection.sql
-- Astar Care — least-privilege fix for ac_workers (prepared 2026-09-07, NOT applied to production).
--
-- PROBLEM (verified by inspecting pg_policies / grants on 2026-09-07):
--   * RLS policy w_upd lets an authenticated worker UPDATE their own ac_workers row
--     (qual AND with_check = ac_is_admin() OR auth_uid = auth.uid()).
--   * RLS restricts ROWS, not COLUMNS, and the role `authenticated` holds UPDATE on the
--     whole table, so a worker can PATCH is_admin, rates, email, active or auth_uid on
--     their own row through PostgREST.
--   * ac_is_admin() (SECURITY DEFINER) trusts ac_workers.is_admin, so a self-promoted
--     worker becomes an admin for every other policy.
--   * The role `anon` also holds table privileges on ac_workers (no anon policies exist,
--     so RLS blocks it today, but the grant is unnecessary surface).
--
-- FIX: keep the row policy (workers still need to update their own row for the
-- must_change_password flow and, later, name/colour), but enforce COLUMN protection in
-- the database with a BEFORE UPDATE trigger that rejects changes to protected columns
-- unless the caller is an admin. Admin workflows (Team → Edit worker, Rates, Reset
-- password, Create login which sets auth_uid) run as the admin JWT and keep working.
--
-- Worker-editable columns on their OWN row: name, colour, must_change_password.
-- Admin-only columns: is_admin, rates, email, active, auth_uid, id, created_at.
--
-- DEPLOY: run in the Supabase SQL editor (or `supabase db push`) as the postgres role.
-- ROLLBACK: see the block at the end (drops the trigger + function, re-grants anon).
-- VERIFY: migrations/tests/001_verify.sql (runs inside a transaction and rolls back).

begin;

create or replace function public.ac_workers_protect_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- admins (checked through the existing security-definer helper) may change anything
  if public.ac_is_admin() then
    return new;
  end if;
  -- everyone else: only the caller's own row (RLS already ensures this) and only the
  -- profile fields below may change. Anything else is rejected, not silently ignored.
  if new.is_admin is distinct from old.is_admin
     or new.rates is distinct from old.rates
     or new.email is distinct from old.email
     or new.active is distinct from old.active
     or new.auth_uid is distinct from old.auth_uid
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'ac_workers: only an administrator can change admin status, rates, email, active or login link'
      using errcode = '42501';   -- insufficient_privilege
  end if;
  return new;
end;
$$;

revoke all on function public.ac_workers_protect_columns() from public, anon, authenticated;

drop trigger if exists ac_workers_protect_columns on public.ac_workers;
create trigger ac_workers_protect_columns
  before update on public.ac_workers
  for each row execute function public.ac_workers_protect_columns();

-- anon never legitimately touches worker rows (sign-in reads happen with the user's JWT)
revoke all on table public.ac_workers from anon;

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK (run only if the trigger breaks a legitimate admin workflow):
-- begin;
--   drop trigger if exists ac_workers_protect_columns on public.ac_workers;
--   drop function if exists public.ac_workers_protect_columns();
--   grant select, insert, update, delete on table public.ac_workers to anon;  -- restores prior (over-broad) state
-- commit;
-- ---------------------------------------------------------------------------
