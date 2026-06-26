## Goal

When an Excel attendance sheet is uploaded (like the FPL muster you shared), each row's **"Designation / Department"** column drives where the entries land:

- Row designation matches the candidate's primary on the unit → save under primary (no change).
- Row designation matches a **different** designation that exists on this unit's active contract → save under that designation; the second row block appears automatically on the muster.
- Same person appears twice in the sheet with two different designations → each block saves under its own (candidate, designation) pair.
- Row designation isn't on the unit's contract → fall back to the candidate's primary and surface a clear warning toast listing the unmatched designations, so the FO knows to either add the designation to the contract or correct the sheet.

## What's broken today

In `processAttendanceExcel` (`src/routes/admin.attendance.$unitId.tsx`, ~L851):

1. The "Designation / Department" column is **ignored**. Every row is saved under the candidate's primary designation, even if the sheet clearly shows them under a different one.
2. The cell parser regex `^([A-Z]+)(?:\s+(\d+(?:\.\d+)?))?$` doesn't match the FPL muster's actual format `D ,1` / `P ,0.5` / `ED ,1` (comma + optional space before the OT digit). Those cells silently drop.
3. `byCandidate` is a flat `candidateId → rows` map, so a person appearing under two designations in the sheet has one set overwriting the other.

## Fix

### 1. Designation-aware row resolution
- After matching `mr` by employee code/name, read the **designation cell** for that row (auto-detect the column on the header row by matching headers like `Designation`, `Department`, `Designation / Department`).
- Normalize and look up against `contractDesignations` (already loaded — list of `{ designationId, designationName }` for this unit's active contract).
- If matched and it differs from `mr.designationId` → switch the target pair to `(candidateId, matchedDesignationId)`. The auto-create flow added earlier handles the rest: upsert creates the entries and `musterRows` re-derives the second row block.
- If the cell is non-empty but doesn't match anything on the contract → save under primary, push the designation name into a `designationsNotOnContract` set, surface it via a warning toast at the end (same wording as the OCR path).

### 2. Per-(candidate, designation) grouping
- Replace the `byCandidate` map with `byPair: Map<"candidateId|designationId", rows[]>`.
- On apply, iterate the map and call `upsertEntries(candidateId, designationId, rows)` per pair, so two designation blocks for the same person save independently.
- A single sheet row contributes to exactly one pair. The "same person on two designations" case is handled by the sheet having two separate rows for that person.

### 3. Cell parser handles the FPL format
- Update the regex to accept an optional comma and whitespace between the code and the OT digit: `^([A-Z]+)(?:\s*,?\s*(\d+(?:\.\d+)?))?$`.
- Verified against the uploaded sheet — covers `P`, `A`, `W`, `D ,1`, `P ,0.5`, `ED ,1`, `W ,1`.

### 4. Summary + activity log
- Extend the toast: `"<n> cells imported · <n> rows on secondary designation · <n> unmatched designations (X, Y)"`.
- `logActivity` with module `"Attendance"` includes the secondary-designation count.

## Out of scope (unchanged)

- OCR image flow (already designation-aware from the previous turn).
- Payroll calc (already splits per `(candidate, designation_id)`).
- Cross-unit reassignment.
- Schema / contract-resource auto-creation — designations still must be added to the contract first.

## Files touched

- `src/routes/admin.attendance.$unitId.tsx` — `processAttendanceExcel` only.

No schema migration, no new files, no payroll changes.
