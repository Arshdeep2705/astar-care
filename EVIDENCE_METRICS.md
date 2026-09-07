# Astar Care — Summary tab metric definitions (v2, 2026-09-07)

These definitions are shown in the app's Summary → "How the figures are built" panel and are
embedded in every exported report. `calc_version` in a finalised report records the app build
and this document's version (`metrics-v2`).

## General rules

| Rule | Definition |
|---|---|
| Timezone | All dates and times are the participant's service-local time (Australia/Melbourne), as entered by the worker. The app runs in the device's local timezone; the export states the timezone. Daylight-saving transitions are handled by counting recorded interval blocks, never by subtracting clock times across the change. |
| Event time vs record time | Every figure uses the **event** date/time recorded on the form (shift date, incident date/time, near-miss date/time, overnight bed/up times). Record creation and edit timestamps are never used in calculations and never appear in exports. |
| Overnight labelling | An overnight (sleepover) shift is labelled by its start date and end date ("night of Mon 31 Aug → Tue 1 Sep"). It is counted under the night it **started**. |
| Rostered vs documented | *Rostered* = a shift row exists for the participant. *Documented* = a record of the relevant type exists for that shift. Rostered does not mean delivered or documented. Coverage is always shown as **n documented of N rostered** with the percentage beside the counts. |
| Missing vs zero | A missing record (no form) is **not recorded** and is excluded from numerators and denominators. A form field left blank is **not recorded** (stored as null) and is excluded from that measure. A recorded 0 is a recorded 0. Records created before 2026-09 stored blank numeric answers as 0; those rows are shown in "Sources and checks" so a reviewer can decide. |
| Partial records | A night with an overnight summary but no sleep-log hours, or a care log with only some measures, counts only for the measures it actually contains. It never counts as a complete night/day. |
| Deduplication | One real event described in several places (shift note, incident report, uploaded PDF) counts **once**. The structured record (incident report / near-miss entry) is the counted instance; reviewed observations that duplicate it are linked via `duplicate_of` and excluded from totals. Uncertain duplicates are flagged for review, not merged automatically. |
| Excluded sources | Sources marked *excluded* (training samples, generated examples, demonstrations) never enter any calculation. Observations still `proposed` or `rejected` never enter published figures. |
| Averages of clock times | Bed times and up-for-the-day times are averaged as minutes after 12:00 noon of the start date, so a 23:30 bed time and a 00:30 bed time average to 00:00, not 12:00. |
| Full-period fetch | The Summary fetches the selected period from the server in pages of 1,000 rows per table until exhausted. It does not use the app's rolling cache. |

## Safety events

| Metric | Source | Unit | Numerator / denominator | Notes |
|---|---|---|---|---|
| Falls | `ac_incident_forms` where `is_fall = true` and `incident_date` in period | count | — | A fall is only what the worker recorded as a fall. Being in bed, a bathroom or a vehicle is not treated as a transfer unless the fall location says so **and** the report describes a transfer. |
| Near misses | `ac_near_misses` with `nm_date` in period | count | — | Prevented falls with no injury, as recorded. |
| Falls needing a second person | falls with `second_person_needed = true` | count / falls | | "Second person" is whoever helped (worker, neighbour, ambulance). It is not a staffing recommendation. |
| Minutes on the floor | sum of `minutes_on_floor` over falls where it is recorded | minutes; n recorded / falls | | Shown as "time on the floor before being helped up" — not "time waiting for help". Falls with no minutes recorded are listed as *not recorded*. |
| Emergency calls | incidents with any `emergency` value other than "No" | count | | Lists the service(s) called. A cancelled ambulance is still a call. |
| Injuries | incidents with `injuries` ≠ "No" | count | | Uses the worker's answer to Q17 only. |
| Equipment involved | incidents with `equipment_involved` or type "Equipment failure", plus near misses with `equipment_factor` | count | | |
| Transfer-related | fall/near-miss location in {Bed, Shower, Toilet, Couch to wheelchair, Wheelchair to bed, Vehicle} **and** the worker answered the transfer question or the location itself names a transfer | count / events | | Location alone does not prove a transfer was in progress; the report says "at a transfer location" where the record does not say more. |

## Overnight (sleepover) — reported inside the 11:00 pm to 7:00 am block

| Metric | Source | Unit | Definition |
|---|---|---|---|
| Nights rostered | `ac_shifts` type sleepover, date in period | count | Denominator for coverage. |
| Nights with an overnight summary | `ac_overnight_logs` joined to those shifts | count / nights rostered | Coverage. |
| Hours asleep | `asleep_hours` | hours per night | As transcribed by the worker from the paper sleep log (✓ blocks × 0.25). |
| Hours of direct worker assistance | `active_hours` | hours per night | X blocks × 0.25: intervals where the worker was **assisting** (toileting, changes, transfers, prompting). |
| Awake, no assistance | 8 − asleep − active | hours per night | Derived; shown separately, never added to assistance. |
| Unrecorded | night rostered but no summary, or summary without hours | — | Shown as a gap on the chart, not as 0. |
| Wakes needing support | `wakes` | count per night | Times the participant woke needing support **before** the wake they got up for the day. The final wake is not counted here; it is the "up for the day" time. |
| Nights above the 2-hour inclusion | active_hours > 2 | count / nights with hours | The NDIS sleepover price includes up to 2 hours of active support per night; time beyond that is claimable separately (NDIS Pricing Arrangements and Price Limits 2026-27, sleepover supports; NDIS Commission "Sleepover shifts" guidance). The reference line on the chart is drawn against **active support hours only**. Crossing it is a pricing fact, not an eligibility finding. |
| Support outside the block | shift note narrative before 11 pm / after 7 am | — | Not in these figures. Reviewed observations with category *overnight_assist* outside 23:00–07:00 appear in the separate "full shift" table. |

## Daytime support and proposed 2:1

| Column | Definition |
|---|---|
| Task / activity | From the care log measure or a reviewed observation. |
| Assistance observed | The care log count or the observation's assist type. |
| Frequency | Per day = total ÷ days that have a care log. Never divided by rostered days. |
| Actual staffing | Workers actually involved, from the observation (`workers_involved`) or the incident's "second person" answer. |
| Proposed staffing | Free-text entered by the admin on the Summary, labelled *proposed*. Never derived from the data. |
| Clinician recommendation | Only from an uploaded source marked kind = upload with author stated (e.g. OT report) and a reviewed observation quoting it. |
| Evidence gap | Automatically "no assessment on file" when no clinician source exists for the task. |

The four facts are kept apart in every table: *two workers actually assisted* · *one worker reported difficulty* · *a clinician recommended two* · *the provider is requesting two*.

## Funding context

Plan allocation, remaining balance, delivered, claimed and provider-funded amounts are separate fields entered by the admin on the Summary with the document they came from. Nothing is inferred from worker pay rates or from a dollar amount alone. A shortfall is displayed only when allocation, period and claimed figures are all present and verified.

## Report versions

A finalised report stores: period, timezone, calc_version, the included source ids and accepted observation ids, the full computed dataset (snapshot), reviewer name and finalised time, and the export timestamp. Later data changes do not alter a finalised version. Re-running the report creates a new draft version.
