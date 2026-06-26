## Goal

Two attendance-sheet fixes in `src/routes/admin.attendance.$unitId.tsx`:

1. Add a **Clear All** button on the muster page that wipes every attendance entry for this unit + period in one click (with confirm).
2. Make Excel import **authoritative to the sheet** — stop the "ghost row under Designation A" problem where a person ends up with attendance under both A and B even though the uploaded sheet only listed them under one designation.

## Why the ghost row appears today

When an Excel is imported, the importer only writes the cells it sees and routes each row to the matched `(candidate, designation)` pair. It never deletes any prior entries. So if that candidate previously had entries under another designation (from a prior import, an earlier OCR pass, or manual marking), those entries stay in the database and continue to render as a second row block on the muster — even though the freshly-uploaded sheet shows the person under only one designation.

The user's rule is explicit: "first review the sheet, then fill the data accordingly — do not add anything yourself." So the import must make the sheet the source of truth for every candidate the sheet covers.

## Fix 1 — Clear All button

Add a destructive-styled button in the header action row next to "Upload Attendance" / "Export":

- Visible only when `editable` is true (draft / rejected sheets).
- Click → `ConfirmProvider` confirm: "Clear all attendance for this period? This deletes every entry on this sheet and cannot be undone."
- On confirm: `delete from attendance_entries where unit_id = :unitId and entry_date between :start and :end`.
- After delete: `queryClient.invalidateQueries({ queryKey: entriesQK })`, toast "Cleared N entries", `logActivity({ module: "Attendance", action: "Clear all entries", details: { unit_id, period, deleted: N } })`.

No schema change, no RLS change (existing delete policy already allows the FO / admin on this unit).

## Fix 2 — Sheet-authoritative import

Change `processAttendanceExcel` so the sheet is the source of truth:

1. While walking the sheet rows, collect `candidatesInSheet: Set<candidateId>` for every row that matched a muster employee (regardless of whether any cells were filled).
2. After parsing, **before** the `upsertEntries` loop, delete all existing entries in this period for those candidates across **all** designations:
   ```
   delete from attendance_entries
   where unit_id = :unitId
     and candidate_id in (:candidatesInSheet)
     and entry_date between :start and :end
   ```
3. Then run the existing `upsertEntries` loop, which writes only what was in the sheet, under exactly the `(candidate, designation)` pair the sheet listed.
4. Result: if the sheet only has the person under Designation B, the prior Designation A entries are gone and only the B row block remains. If the sheet lists them under both A and B (two rows), both are preserved exactly as written.

Candidates **not present** in the uploaded sheet are untouched.

Update the success toast to include `cleared N stale entr(y/ies)` so the FO sees what happened. Extend the `logActivity` `details` with the cleared count and the candidate ids.

OCR import (`processAttendanceImage`) currently has the same gap. Apply the same "delete first for candidates the OCR matched, then upsert" treatment there so behaviour is consistent across both upload paths.

## Out of scope

- No payroll-calc changes.
- No schema migration, no new tables, no RLS edits.
- Designation auto-creation behaviour is unchanged — row blocks still appear from whatever entries exist after the import.
- Manual cell edits and the per-row "Clear row" affordances stay as-is.

## Files touched

- `src/routes/admin.attendance.$unitId.tsx` only — header action row (Clear All button + confirm), `processAttendanceExcel` (collect candidates, delete-before-upsert), `processAttendanceImage` (same delete-before-upsert).
