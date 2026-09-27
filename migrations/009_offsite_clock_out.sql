-- 009_offsite_clock_out.sql — 2026-09-27
-- Owner: any worker may CLOCK OUT away from the client's address (clock IN keeps the geofence).
-- An off-site clock-out records the pin (lat/lng, already stored), the distance, offsite = true
-- and a short required reason the worker types ("Where are you / why?"). Pattern copied from
-- the King Kitchen attendance app. Additive: existing rows get offsite = false, reason null.
begin;
alter table public.ac_clock add column if not exists offsite boolean not null default false;
alter table public.ac_clock add column if not exists offsite_reason text;
alter table public.ac_clock drop constraint if exists ac_clock_offsite_reason_len;
alter table public.ac_clock add constraint ac_clock_offsite_reason_len check (offsite_reason is null or char_length(offsite_reason) <= 300);
comment on column public.ac_clock.offsite is 'true = clocked outside the client geofence (clock-out only); pin in lat/lng, reason in offsite_reason';
comment on column public.ac_clock.offsite_reason is 'Worker''s own words: where they were / why they clocked out away from the client address';
commit;
-- ROLLBACK: alter table public.ac_clock drop column offsite_reason; alter table public.ac_clock drop column offsite;
