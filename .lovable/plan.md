## Goal

1. **Lock future-date attendance**: no cell beyond today can be marked (UI disabled + server reject).
2. **Multi-designation rows**: the same candidate can appear as multiple line items on the muster, one per designation that exists on the unit's contract. Payroll calculates each line independently against its designation's wage structure.

## Schema (one migration)

`attendance_entries`:
- Add `designation_id uuid REFERENCES designations(id)` (nullable initially for backfill).
- Backfill from the candidate's primary `designation_id`.
- Drop the existing unique `(unit_id, candidate_id, entry_date)`.
- Add unique `(unit_id, candidate_id, designation_id, entry_date)`.
- Add trigger rejecting `entry_date > current_date` on insert/update.

Existing rows survive — each becomes the "primary designation" line.

## Attendance UI (`admin.attendance.$unitId.tsx`)

- Query all `contract_resources` for the unit's active contract → list of designations available (id, name, gross).
- Each muster row is keyed by `(candidate_id, designation_id)` instead of `candidate_id`.
- Per candidate, render the primary designation row plus any extra `(candidate, designation)` rows that already have entries.
- Add an **"Add row"** action on each candidate that opens a popover listing the contract's other designations; clicking inserts a new empty row for that pair.
- Allow removing an extra row (only when no entries exist on it, or with a confirm to clear entries).
- Disable click / drag / popover on date cells where `cellDate > today` (greyed out, "Future date — cannot mark" tooltip).
- All upsert/save calls include `designation_id`; entry queries fetch `designation_id` and key the map as `candidate|designation|date`.

## Payroll (`admin.payroll.$unitId.tsx` + `payroll-calc.ts`)

- Group entries by `(candidate_id, designation_id)`; each group is one payroll line.
- For each line, look up the matching `contract_resources` row by `designation_id` and run `computeWages` against it.
- Render multiple line items per candidate (e.g. "Priya Sharma — Lady Security Guard" and "Priya Sharma — Senior Guard"), each with its own gross/net.
- Totals across all lines roll up per candidate and per unit.

## Out of scope

- No change to attendance sheet approval lifecycle.
- No change to roles/RBAC. The new `designation_id` is purely a payroll/wage selector; `role_key` on the candidate stays as-is.
- No change to invoice generation beyond what naturally flows from payroll lines.

## Files touched

- `supabase/migration` (new)
- `src/routes/admin.attendance.$unitId.tsx` (multi-row UI, future lock)
- `src/routes/admin.payroll.$unitId.tsx` (per-designation grouping)
- `src/lib/payroll-calc.ts` (helper signature already supports per-resource calc — confirm and reuse)