# Per-Designation Attendance → Payroll

## Goal
A guard onboarded as Designation A at Unit A is paid on A's salary structure. If a Field Officer reassigns them to Designation B (same or different unit) mid-month, attendance from that point is logged under B and payroll automatically computes those days using B's contract line. When an attendance sheet is uploaded, OCR must read the designation written next to each row and split entries by designation accordingly.

## Current state (already working)
- `attendance_entries` is keyed by `(unit_id, candidate_id, designation_id, entry_date)` — multiple designations per candidate per period are already supported in storage.
- `admin.payroll.$unitId.tsx` already groups payroll line items by `(candidate, designation_id)` and pulls the matching contract resource per designation, so once entries carry the right `designation_id`, payouts split automatically.
- Muster builder already renders an extra row block for any non-primary designation it finds in existing entries.

## Gaps to fix

### 1. Mid-period designation / unit reassignment (UI + write path)
On the unit muster (`admin.attendance.$unitId.tsx`) and on the candidate profile, add a **"Reassign role"** action on each guard row:
- Inputs: new Unit (default = current), new Designation, effective date (default = today).
- On save:
  - Update `candidates.designation_id` (and `candidate_units` mapping if unit changed) to the new values.
  - Insert a tiny audit log entry via `logActivity` ("Attendance – Reassign role").
  - Existing attendance rows are untouched (they keep the old `designation_id`), so historical days stay on Designation A's salary; new days get inserted under Designation B automatically.
- The muster immediately shows a second row block for Designation B from the effective date forward; cells before that date stay editable only on the A row.

### 2. OCR: read designation per row from the uploaded sheet
Update `src/lib/attendance-ocr.functions.ts`:
- Accept a `roster` of `{ id, name, employee_code, designation_id, designation_name }` (every candidate × designation pair currently in the muster, not just primary).
- Tighten the system prompt: each printed muster row has a designation column / header; the model must match the row to **one specific (candidate_id, designation_id) pair** from the provided list. If the sheet shows the same person twice under two designations, emit two separate row blocks.
- Extend each output row with `designation_id` (validated against provided pairs); fall back to the candidate's primary designation only when the sheet shows no designation text.
- `row_summaries` keyed by `(candidate_id, designation_id)` too.

Update the OCR apply step in `admin.attendance.$unitId.tsx` (`processAttendanceImage`):
- Build `pairByKey` from all muster rows (not just primary).
- Group OCR rows by `(candidate_id, designation_id)`; delete and re-upsert per pair using the existing `upsertEntries(candidateId, designationId, …)`.
- If OCR returns a designation that isn't in the muster yet (genuine new assignment seen on the sheet), surface it as an unmatched-row warning and prompt the FO to run **Reassign role** first, then re-import.

### 3. Payroll verification (no logic change expected)
- After the above lands, regenerate payroll for a candidate that has split days; confirm the line items show two rows (Designation A days × A rates, Designation B days × B rates) and that totals/exports reflect both.
- If the contract is missing a resource line for Designation B at the unit, surface a clear warning row instead of silently zeroing — reuse the existing "missing contract" warning path.

## Technical notes
- No schema migration required: `attendance_entries.designation_id` and the unique key already support multi-designation per candidate.
- `inv-doc-summary` / activity log conventions: log every reassign with module name "Attendance".
- Keep all edits to frontend + the OCR server function; payroll calc stays untouched.

## Out of scope
- Backfilling historical attendance to a new designation (explicitly preserved on the old designation per requirement).
- Cross-branch transfer workflow (handled separately via the existing reports-to / scope flows).
