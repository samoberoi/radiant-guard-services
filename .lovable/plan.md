## Goal

Three fixes to the multi-designation attendance/payroll flow:

1. Muster + payroll should only show designation buckets that actually have attendance.
2. Search box on the muster (name / employee code / designation).
3. **OT cells are OT-DAYS, not OT-HOURS.** `0.5` = half OT day, `1` = one OT day. Fix the import and the payroll math accordingly.

## Rules of the system (no schema change)

- Primary designation per candidate drives `candidates.designation_id`.
- Additional designations live in `candidate_designations`.
- Attendance is per `(unit_id, candidate_id, designation_id, entry_date)` — already unique-keyed.
- Payroll groups by `(candidate, designation_id)`.

## Fix 1 — Muster only shows designations with attendance (or the primary)

`src/routes/admin.attendance.$unitId.tsx` currently builds the roster as the cross product of every candidate × every allowed designation they hold. Change the row builder to:

1. Always include the **primary** designation row.
2. Include any non-primary designation row only if `attendance_entries` has at least one record for that `(candidate, designation_id)` in the selected period.
3. After OCR/Excel apply, re-derive the row set from the freshly written entries so a designation that wasn't worked this month disappears on next render.

The OCR pair list still receives every allowed `(candidate, designation_id)` so the model can route a printed designation column. The trimming is render-time only.

## Fix 2 — Payroll hides empty designation buckets

`src/routes/admin.payroll.$unitId.tsx` builds one line item per `(candidate, designation_id)`. Skip any bucket where `P + PH + OT days === 0` AND no additions/deductions are tagged to that designation. Tagged manual entries keep their bucket as an override.

## Fix 3 — Attendance search

Add a single search input above the muster in `src/routes/admin.attendance.$unitId.tsx`. Case-insensitive substring match across full name, employee code, and the row's designation name. Client-side filter over loaded roster.

## Fix 4 — OT values are days, not hours

Today `attendance_entries.ot_hours` is treated as hours throughout — OCR clamps to `0..24`, Excel import stores the raw cell as hours, and `src/lib/payroll-calc.ts` uses `ot_hours` directly. The user's musters write `0.5` to mean half an OT day and `1` to mean one OT day. Two clean options; going with **(B)** to keep the schema stable and avoid a data migration.

### (B) Reinterpret `ot_hours` as OT-days at the edges (chosen)

Keep column name `ot_hours` (schema stays). Treat every read/write as **OT days** end-to-end:

- `src/lib/attendance-ocr.functions.ts`: drop the "ot_hours is the overtime number" hours framing in the system prompt; document explicitly that the OT cell value is OT-days (`0.5` = half OT day, `1` = one OT day, max ~2). Clamp to `0..2` instead of `0..24`. Stop converting `D ,1` → `1` as hours — it's already days.
- `src/routes/admin.attendance.$unitId.tsx` Excel importer: parse the OT sub-cell as days, not hours. Update the muster cell editor so the OT input is labeled "OT days" and accepts `0`, `0.5`, `1`, `1.5`, `2`. Update the row-total label from "OT Hrs" to "OT Days".
- `src/lib/payroll-calc.ts`: OT-day count comes from `SUM(ot_hours)` rows treated as days. OT amount = `(Gross − Uniform) / divisor × OT_days` (already the formula the user confirmed earlier — but the input is now days, not hours/8). Remove any `/ 8` conversion if present.
- `src/lib/attendance-fetch.ts`: no change — it just passes the number through.
- Activity log entries written by the importer should say "OT days" in their summary so the audit trail matches.

No DB migration. Historical rows that stored hours-as-hours (if any) get reinterpreted as days; the user confirmed the sheets they upload always meant days, so this matches reality.

## Out of scope

- No schema changes.
- No rename of the `ot_hours` column (would cascade to types.ts and every consumer; not worth the churn).
- No change to the candidate-master designations editor.
- No payroll-math change beyond the OT-days reinterpretation and skipping empty buckets.

## Files touched

- `src/routes/admin.attendance.$unitId.tsx` — trim empty designation rows, post-apply re-derive, search box, OT label/parse as days, Clear All untouched.
- `src/routes/admin.payroll.$unitId.tsx` — skip zero-activity buckets unless overridden.
- `src/lib/attendance-ocr.functions.ts` — OT-days prompt + 0..2 clamp.
- `src/lib/payroll-calc.ts` — treat `ot_hours` field as OT days; remove any hours→days conversion.

## Verification after build

1. Person with a master secondary designation but zero attendance under it this period → one muster row, one payroll line.
2. Person with 3 receptionist + 23 guard days → two rows in muster, two payroll lines with their own gross.
3. Search "anurag" filters the muster.
4. Upload a sheet with OT cells `0.5` and `1` → OT Days column shows `0.5` and `1`, payroll OT amount = `(Gross − Uniform)/divisor × OT_days`.
