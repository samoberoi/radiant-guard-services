## Goal

Two fixes after reviewing the FPL May 2026 muster (`FPL_Attendance_Report_on_52026 (13) (3).xlsx`):

1. Correct the candidate master designations that don't match what the FPL sheet shows.
2. Make designation assignment on a candidate a **multi-designation** master field, so the attendance system can pick the right one per day going forward (not just the single primary).

## Fix 1 — Master designation mismatches (FPL)

The sheet lists each employee's actual on-site designation in column D. Comparing every named row to `candidates.designation_id`, these five are wrong and will be corrected to match the sheet:

| Employee | Current in system | Sheet says (correct) |
| --- | --- | --- |
| Anurag Mahunta | Office Assistant | BMS Operator |
| Dham Singhrawat | Security Guard | Security Supervisor |
| Muralidhar Rangnath Chitragar | Security Guard | Security Supervisor |
| Rohit Rajendra Rathod | BMS Operator | Admin Executive |
| Vaishnavi Jaywant Kamble | Security Guard | Receptionist |

Every other named row in the sheet already matches the master.

Cleanup also: the `designations` table has both `BMS Operator` and `BMS OPREATOR` (typo duplicate from an old import). The typo row will be merged into the canonical `BMS Operator` — repoint any candidates / contract resources / attendance entries pointing at the typo, then delete the typo row. Kapil Mahakur (currently on the typo row) ends up on the canonical row.

All changes via a single migration; `logActivity` entries written per candidate so the audit trail explains the rename.

## Fix 2 — Multi-designation on candidate master

Today `candidates.designation_id` is a single column. The attendance muster already supports per-row (candidate × designation) entries — OCR/Excel will create a row block for any contract designation the sheet shows — but the **candidate master itself** only stores one. That's why a person who works two roles ends up looking "wrong" on the profile and why future imports have to guess the secondary designation from the contract roster.

Add a proper many-to-many master:

- New table `public.candidate_designations`
  - `candidate_id uuid → candidates(id) on delete cascade`
  - `designation_id uuid → designations(id) on delete restrict`
  - `is_primary boolean default false`
  - `effective_from date null`, `effective_to date null` (both optional; null = open-ended)
  - `notes text null`
  - unique `(candidate_id, designation_id)`
  - one row with `is_primary = true` per candidate (partial unique index)
  - standard `created_at`/`updated_at` with `set_updated_at` trigger
  - GRANTs to `authenticated` + `service_role`, RLS mirroring `candidates` (admin/inventory-manager full, owning FO / branch-scope read+write for their guards, candidate read self).
- Backfill on creation: insert one row per existing `candidates` row using their current `designation_id` as `is_primary = true`. `candidates.designation_id` stays as the convenience pointer to the primary so nothing else breaks; a trigger keeps it synced to the primary row.
- Seed the five FPL employees from Fix 1 with their additional/correct designations.

UI changes (candidate profile, `src/routes/admin.candidates.$id.details.tsx`):

- New "Designations" card under the existing role section: list current designations, mark which is primary, allow add/remove and date-range edit. The primary one drives `candidates.designation_id`.
- Field Officer dashboard (`src/routes/admin.field-dashboard.tsx`): show all designations as chips on the guard tile.

Attendance integration (`src/routes/admin.attendance.$unitId.tsx`, `src/lib/attendance-ocr.functions.ts`):

- When building the OCR/Excel candidate × designation pairs for a unit, include every active designation from `candidate_designations` (intersected with the contract's allowed designations), not just the primary. This makes future imports correctly route a person to the right designation row — exactly what the user asked for ("according to their attendance, assign them to their particular days and duties").
- No payroll-calc change needed — it already groups by `(candidate, designation_id)` per entry.

## Out of scope

- No change to attendance entries that are already correct in May.
- No change to payroll math, contract structure, or RLS on existing tables beyond what's listed.
- No reshuffle of `role_key` — that stays as the high-level access role; `designation` is the work-role used for attendance/payroll mapping.

## Files / migration

- Migration: rename typo designation merge, fix five candidates, create `candidate_designations` + RLS + backfill + sync trigger.
- `src/routes/admin.candidates.$id.details.tsx` — Designations card.
- `src/routes/admin.field-dashboard.tsx` — chips.
- `src/routes/admin.attendance.$unitId.tsx` — pull pairs from `candidate_designations`.
- `src/lib/attendance-ocr.functions.ts` — already takes pair list, no behaviour change (just receives the wider set).
