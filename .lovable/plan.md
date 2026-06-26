## Goal

On the unit muster, a candidate can carry **multiple designations within the same unit** (e.g. Security Guard for day duty + Office Assistant for OT). Attendance entries are stored per `(candidate, designation)` and payroll automatically bills each block against the matching contract resource for that unit. **Unit changes are out of scope** — per your update, the candidate stays on their assigned unit and only the designation varies.

## What already works (no change)

- `attendance_entries` is keyed by `(unit_id, candidate_id, designation_id, entry_date)` — multi-designation per candidate already storable.
- Payroll groups by `(candidate, designation_id)` and pulls the matching contract resource per designation.
- Muster builder already renders a second row block whenever entries exist under a non-primary designation.

## What changes

### 1. OCR auto-creates the second designation row (no manual reassign UI)

Per your choice, no "Reassign role" dialog. When the FO uploads the attendance sheet:

- `attendance-ocr.functions.ts` already receives every `(candidate_id, designation_id)` pair on the muster, but today only the candidate's *current* designation is sent. Extend the roster sent to OCR to include **every contract resource designation valid for this unit** for each candidate (i.e. all designations that have a resource line on the unit's active contract), not just their primary one.
- OCR continues to return `designation_id` per row and per summary.
- On apply in `admin.attendance.$unitId.tsx`:
  - Group OCR rows by `(candidate_id, designation_id)`.
  - For any `(candidate, designation)` pair that has no row block on the muster yet but IS a valid contract resource on this unit, **auto-create the second row block** and upsert entries into it.
  - If OCR returns a designation that is **not on the unit's active contract**, block that row and surface a clear toast: *"Designation X is not on Unit A's contract — add it to the contract first, then re-import."* (Per your "Block with a warning" choice.)

### 2. Per-designation OT (separate cells per row)

Today OT is stored on `attendance_entries.ot_hours` keyed by `(candidate, designation, date)`, which already supports per-row OT — but the muster renders OT on the same date only against whichever row the FO is typing into. Confirm and tighten:

- Each row block (one per designation) has its **own P/A and its own OT cell per day**. Day-duty hours can land on Designation A's row, OT hours on Designation B's row, for the same date.
- OCR is updated so that when it sees an OT digit explicitly tagged to a second designation in the printed sheet, it emits that OT under the second designation's row.
- Payroll already monetises OT per line item using that line's resource rate, so no calc changes — Designation A's day duty bills at A's rate, Designation B's OT bills at B's rate.

### 3. Inline "Add designation row" for manual entry

For cases where the FO is typing the muster instead of uploading, add a small **"+ Add designation"** action on each candidate row that opens a picker listing only designations valid on this unit's active contract (excluding ones already on the muster for that candidate). Selecting one immediately creates the empty second row block so the FO can type P / OT into it. This is needed because OCR auto-create only fires on upload; without it the FO has no way to enter a second designation manually.

### 4. Contract-resource guard (single source of truth)

Add a tiny helper `getUnitContractDesignations(unitId, period)` that returns the set of `designation_id`s with a live resource on the unit's contract for that period. Used by:
- OCR roster expansion (step 1).
- Inline picker (step 3).
- OCR apply validator (step 1, "Block with a warning").
- Payroll already shows the missing-contract warning when entries point at a designation with no resource — keep that as a backstop.

### 5. Payroll verification only (no calc change)

After the above lands, a candidate with split days produces two payroll line items — Designation A days × A rates, Designation B days × B rates — using the existing logic. Verify on a test candidate; no code change expected in `payroll-calc.ts`.

## Out of scope (per your direction)

- Cross-unit reassignment / Unit changes mid-period.
- Backfilling historical entries onto a new designation.
- A "Reassign role" dialog.

## Files touched

- `src/lib/attendance-ocr.functions.ts` — roster now spans all valid contract designations per candidate; system prompt already handles multi-pair output.
- `src/routes/admin.attendance.$unitId.tsx` — extend roster build, auto-create row block on apply, inline "+ Add designation" picker, contract-guard validation + toast.
- New small helper `src/lib/unit-contract-designations.ts` (or inline in the route) for the contract-resource lookup.
- `logActivity` calls on inline add and on OCR auto-create ("Attendance – Added designation row").

No schema migration. No payroll calc change.
