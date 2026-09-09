# Astar Care — database migrations awaiting deployment approval

Prepared 2026-09-07 on branch `codex/astar-ui-evidence`. **None of these has been applied to
the production database.** Each was validated by running its full body plus the checks in
`tests/` inside a single transaction that was rolled back (results recorded below).

| File | What it does | Risk | Verified |
|---|---|---|---|
| `001_worker_row_protection.sql` (APPLIED 2026-09-08) | BEFORE UPDATE trigger on `ac_workers`: only admins may change `is_admin`, `rates`, `email`, `active`, `auth_uid`. Workers keep `name`, `colour`, `must_change_password` on their own row. Revokes the unused `anon` grants. | Low. Admin flows use the admin JWT and pass `ac_is_admin()`. | 7/7 checks pass (`tests/001_verify.sql`, 2026-09-07) |
| `002_evidence_and_roster_integrity.sql` (APPLIED 2026-09-08) | Adds `ac_shifts.two_to_one`; makes structured-log counts nullable (blank ≠ 0); adds transactional RPCs `ac_set_shift_times` and `ac_split_shift`; creates `ac_evidence_sources`, `ac_evidence_observations`, `ac_report_versions` (admin-only RLS, finalised versions immutable); splits the storage policy so `evidence/` objects are admin-only. | Low–medium. Additive. The storage policy change replaces one policy with two equivalent-plus-restriction policies; attachments under `notes/` and `incidents/` keep working for workers. | 8/8 checks pass (`tests/002_verify.sql`, 2026-09-07) |

## How to deploy

1. Back up: Supabase dashboard → Database → Backups (or `pg_dump`).
2. Open the SQL editor as `postgres`, paste `001_worker_row_protection.sql`, run. Then `002_…`.
3. Re-run the matching `tests/*_verify.sql` (they roll back) and confirm every `ok = true`.
4. Deploy the app build that uses them. The app detects the RPCs and new columns at runtime
   and falls back gracefully if they are absent, so the order (DB first, app second) is safe.

## Rollback

Each file ends with a commented rollback block. `001` rollback restores the previous
over-broad state and should only be used if an admin workflow is blocked. `002` rollback drops
the new objects; the nullable-column change is left in place (harmless).

## App behaviour before these are applied

* Roster time edits and splits use two REST calls; if the second call fails the app now reports
  exactly which part saved and which did not, instead of claiming success.
* Blank numeric answers on the care log / overnight form are still stored as 0 by the database
  default; the app marks such rows as "recorded before blank-vs-zero was supported" in Sources
  and checks.
* The Summary import/review workflow is unavailable (the tables do not exist); the tab shows
  the in-app records only and says so.

## Added 2026-09-09 — awaiting approval

| File | What it does | Risk | Verified |
|---|---|---|---|
| `005_summary_analytics.sql` | `ac_evidence_observations.duplicate_of_record` (an observation can point at the incident/near-miss record it repeats, so one event is counted once); `ac_care_logs.shower_done` nullable (offered-but-unanswered is "outcome not recorded", not declined); `ac_split_shift` dates the second segment on the next day for after-midnight splits of overnight shifts and refuses a split time outside the shift **in the database**. Nothing historical is rewritten; `two_to_one`, `second_person_needed` and `single_worker_capacity` stay as columns for old rows but are no longer asked or reported. | Low. Additive; one function body replaced. | 4/4 checks pass in a rolled-back transaction (`tests/005_verify.sql`, 2026-09-09) |

Until 005 is applied the app: links a repeat to a structured record with the legacy self-link + note (readable by the metrics), still stores an unanswered shower outcome as declined (the form now requires an answer, so this only affects old rows), and computes the split segment date in the browser (`evSplitSegmentDate`) while the database function still uses the same date.

Third-party library: the document import now loads **pdf.js 4.9.124** (ES module, `pdf.min.mjs` + `pdf.worker.min.mjs` from cdnjs) with `isEvalSupported:false` and `disableFontFace:true`; 3.x was end-of-life and carried the CVE-2024-4367 arbitrary-JavaScript-in-PDF issue. Verified locally with a text PDF (extracted, 2 proposals) and an image-only PDF (marked for manual entry).
