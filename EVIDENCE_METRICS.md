# Astar Care — Summary metric definitions (metrics-v3, 2026-09-09)

The Summary tab is a data-analytics view of what the support workers recorded. It answers
"what has been recorded in this period?" with counts, durations, dates and sample sizes. It does
not request support, propose staffing, argue funding or draw clinical conclusions. These
definitions are embedded in every export (appendix) and in the app as `EV_DEFINITIONS`
(`parts/p9a_metrics.js`). Version string: `metrics-v3` + app build.

## Event / source model

| Rule | Definition |
|---|---|
| One event, several sources | A real event may be described in an incident report, a sentence in a shift note and a page of an uploaded document. It is counted **once**. The structured record (incident report / near miss record) is the counted instance. A reviewed observation that repeats it is **linked** (`duplicate_of_record`, or `duplicate_of` another observation) and kept as a source reference only. |
| Unlinked look-alikes | Two counted events on the same date within 30 minutes are listed under Checks as a possible duplicate. Both stay counted until a person links them. Same date alone is never treated as a duplicate. |
| What enters a figure | Structured records in the period, plus observations with `status = accepted`, no duplicate link, from a non-excluded source. Proposed and rejected observations, and excluded sources (training samples, generated examples), never enter any figure. |
| Demonstration mode | Uses an entirely synthetic participant, shifts and records (`evDemoDataset`). No real record is mixed in. |

## Period, scope and dates

| Rule | Definition |
|---|---|
| Timezone | Service-local time (Australia/Melbourne) as entered by the worker. The export states the timezone. |
| Default period | The last 4 completed weeks ending yesterday. Presets: 7 days, 4 weeks, 12 weeks. |
| Scope | A shift is *in scope* when its rostered end has passed. Shifts in progress or not started are shown separately ("not yet finished") and are never counted as not recorded. |
| Night keying | A sleepover night is labelled by the date it started and runs to 07:00 next morning. Overnight events after midnight belong to the night that started the evening before (`evNightOf`). The period boundary is applied to the night, so a 03:30 event on the morning after the last day still belongs to the last night. |
| Daylight saving | The 23:00–07:00 window length is taken from the clock (`evBlockHours`): 7 h on the spring-forward night, 9 h on the fall-back night. |
| Buckets | Periods of 35 days or less are bucketed by day; longer periods by ISO week (Monday). |
| Full retrieval | Every table is fetched for the participant and period in pages of 1,000 rows with a stable `id` order until exhausted. Nothing comes from the app's rolling cache. |

## Recorded, partial, not recorded

| State | Meaning |
|---|---|
| Recorded / complete | A structured record exists with the measure filled in. |
| Partial | A record exists but the measure is blank; or, for a night, only reviewed observations with intervals exist. |
| Not recorded | No record. Shown as "Not recorded" or "Insufficient data", never as 0. Excluded from numerators and denominators. |
| Pre-cutoff rows | Structured logs saved before 7 Sep 2026 stored blank answers as 0. They are counted as recorded zeros and listed under Checks. |

## Overview metrics

| Metric | Value | Denominator / note |
|---|---|---|
| Falls recorded | incidents with `is_fall`, plus accepted incident observations whose type is a fall | of incident reports in period |
| Near misses recorded | near miss records + accepted near-miss observations | days with a record |
| Assisted transfers recorded | sum of care-log `transfers` where answered; on a day with no care log, accepted daytime "Transfer" observations are counted instead (never both) | logs answered of logs; reviewed count on unlogged days |
| Incidents involving an emergency call | incidents where any emergency service was recorded as called | of incidents; the form records neither the number of calls nor attendance |
| Average recorded overnight assistance | mean of per-night recorded assistance hours | nights with a value of nights in scope; how many came from reviewed intervals |
| Nights with complete overnight data | nights with an overnight summary that has hours | of nights in scope; partial and not-recorded counts |

## Overnight

| Measure | Definition |
|---|---|
| Assistance hours (per night) | From the overnight summary: X-coded 15-minute blocks inside 23:00–07:00 = elapsed time the worker was assisting. Where no summary exists but accepted `overnight_assist` observations have start **and** end times, their **merged** elapsed time is shown and the night is *partial*. Overlapping intervals are merged, never added (`evMergeIntervals`). |
| Awake, no assistance | Only when the whole window is accounted for: window length − asleep − assistance, from a complete summary. Otherwise not shown. |
| Wakes | The summary's count of times the participant woke needing support **before** the wake they got up for the day. The final wake is not counted. A wake is not an episode. |
| Episodes | Merged intervals of accepted `overnight_assist` observations for the night (an observation without an end time occupies a 15-minute block). |
| By activity | Episodes per recorded activity; hours only over observations with both times. Note length never implies duration. |
| Timeline | Accepted overnight observations with a stated start, plotted on the night they belong to; bar = start and end recorded, dot = start only; unknown times are not plotted. |

## Incidents

| Measure | Definition |
|---|---|
| Incident reports | structured reports + accepted incident observations (counted once) |
| Falls | `is_fall` on the report; on an observation, a type or description that says fall |
| During a transfer | the worker's answer (`during_transfer`); `inferred` only for pre-2026-09-09 rows whose location itself names a transfer; otherwise `unknown`. A location alone never implies a transfer. |
| Injuries | `yes` / `no` / `unknown` from the answer; unanswered stays unknown and is listed under Checks |
| Time on the floor | sum of `minutes_on_floor` where recorded, with the count of falls it was recorded on; described as time before being helped up |
| Emergency | incidents involving a call; the services recorded |

## Near misses

Counts, days with a record, equipment involvement and transfer state as recorded. "What prevented harm" groups the free-text answer into steadied/held, lowered safely, equipment/rail, another person, other, not recorded. A near miss is never a fall.

## Personal care

Totals and per-day are over the logs that answered the measure; per-day divides by days with that measure recorded. Showers: offered / done / declined / outcome not recorded (offered with no completion answer, or a pre-cutoff `false`).

## Versions

Finalising stores in `ac_report_versions.snapshot`: the full computed dataset (including `sourceIndex` with content hashes and `recordIds`), the export options, timezone, the authenticated reviewer (worker id, name, email) and the time. The export renders **only** from the stored dataset. A finalised row cannot be updated or deleted (database trigger). Versions produced by earlier formats are shown as legacy and never re-rendered into the new format.
