-- 004: transfers happen everywhere, and every picker needs a real "none of the above"
--
-- Why: the Summary tab decided whether a fall or near miss was transfer-related by testing the
-- recorded LOCATION against a fixed list (Bed / Shower / Toilet / Couch to wheelchair /
-- Wheelchair to bed / Vehicle). A transfer in the hallway, the kitchen, a doorway or a shopping
-- centre bathroom silently did not count, and the picker had no way to say where it really was.
-- Fix: ask the question directly ("did this happen during a transfer?") and give every choice
-- list an Other option with a free-text box for what it actually was.
--
-- during_transfer is deliberately NULLABLE: true = yes, false = no, null = not asked (rows
-- created before this migration), so the metric can fall back to the old location test for them.

alter table ac_near_misses
  add column if not exists during_transfer boolean,
  add column if not exists location_other   text not null default '';

alter table ac_incident_forms
  add column if not exists during_transfer     boolean,
  add column if not exists fall_location_other text not null default '',
  add column if not exists incident_type_other text not null default '',
  add column if not exists injury_kind_other   text not null default '',
  add column if not exists restrictive_other   text not null default '',
  add column if not exists emergency_other     text not null default '';

comment on column ac_near_misses.during_transfer is
  'Was the participant being transferred when this happened. true/false = answered, null = not asked (pre-2026-09-09 rows).';
comment on column ac_incident_forms.during_transfer is
  'Was the participant being transferred when this happened. true/false = answered, null = not asked (pre-2026-09-09 rows).';

-- every incident picker gains an Other option; the matching *_other column holds what it was
update ac_enums set values = values || array['Other'] where name = 'IR_INCIDENT_TYPE'    and not ('Other' = any(values));
update ac_enums set values = values || array['Other'] where name = 'IR_INJURY_KIND'      and not ('Other' = any(values));
update ac_enums set values = values || array['Other'] where name = 'IR_RESTRICTIVE_TYPE' and not ('Other' = any(values));
update ac_enums set values = values || array['Other'] where name = 'IR_EMERGENCY'        and not ('Other' = any(values));
