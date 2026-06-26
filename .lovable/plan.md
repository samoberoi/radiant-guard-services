## Goal

Extend **Payroll Days Manager** with a fully customizable "Custom Weekdays" method so users can pick which weekdays count as paid/working days (e.g. all 7, Mon–Sat only, or any combination). The existing dropdown in **Contract Resources → Payroll Day Base** already auto-lists every enabled entry, so newly created custom bases appear there instantly. Payroll calculation will then divide salary by the number of those weekdays falling in the payroll period.

Existing methods (`actual_days`, `fixed_days`, `actual_minus_weekly_off`) stay untouched — only a new option is added.

## What the user gets

1. In **Control Center → Payroll Days Manager**, the Add/Edit dialog gains a new method **"Custom — pick weekdays"** that shows 7 checkboxes (Sun…Sat). User can tick any subset to define what counts as a paid/working weekday.
2. Each such base saves the chosen weekday list. Updates / deletes / enable-disable already invalidate the React Query cache shared by the contract dropdown, so changes reflect live.
3. In **Client Contracts → Resource editor → Payroll Day Base** dropdown, the new custom entries appear alongside existing ones (no UI change needed beyond what already exists). The little "payable days" preview next to the dropdown will compute correctly against the new method.
4. **Payroll calculation** (`src/lib/payroll-calc.ts`) uses the custom weekday set: `baseDays = count of selected weekdays inside the payroll period`. Per-day salary, per-component proration, PH and OT all flow through this divisor exactly like today.

## Schema change

`payroll_day_bases` table:

- Add `included_weekdays smallint[]` (nullable). Holds 0–6 ints (0 = Sunday … 6 = Saturday) when `method = 'custom_weekdays'`. NULL for other methods.
- Extend the `method` check (if any) to accept `'custom_weekdays'`. If no check constraint exists, no DB-level work beyond the new column.

No data migration: existing rows are untouched.

## Code touch list

- `src/routes/admin.payroll-days-manager.tsx`
  - Add `"custom_weekdays"` to the `Method` union and `METHOD_META` (icon + label "Custom weekdays").
  - Add `includedWeekdays: number[] | null` to `PayrollDayBase`, `rowToItem`, `toRow`, `validate` (require ≥ 1 day selected), and `describeMethod` ("Salary ÷ count of Mon, Tue, Wed… in that month").
  - In the Add/Edit dialog, render a 7-checkbox row when method is `custom_weekdays`, plus quick presets ("All 7 days", "Mon–Sat", "Mon–Fri"). Pre-select sensible defaults (Mon–Sat) on first switch.
  - Update CSV export column to show the picked weekdays for custom rows.

- `src/routes/admin.contracts.client-contracts.tsx`
  - Extend the local `PayrollDayBase` type and `usePayrollDayBases` query to fetch `included_weekdays`.
  - Update `computePayableDays(base, ref)` to handle `custom_weekdays`: iterate every day of `ref`'s month and count those whose `getDay()` is in `included_weekdays`.
  - Update `basisLabel` to render the friendly description for the new method.
  - Pass `includedWeekdays` through to the payroll-calc resource snapshot wherever `payrollDayBase` is built (so live preview matches actual payroll).

- `src/lib/payroll-calc.ts`
  - Extend `ContractResourceLike.payrollDayBase` with `method: "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays"` and `includedWeekdays?: number[] | null`.
  - In the `baseDays` resolution block (~line 549), add a branch for `custom_weekdays` that walks `periodFrom..periodTo` and counts days whose weekday is in `includedWeekdays`. Fallback to `FALLBACK_BASE_DAYS` if the list is empty.
  - No change to per-component / per-duty / PH / OT math — they all derive from `baseDays`.

- `src/routes/admin.payroll.$unitId.tsx` (if it builds the resource snapshot before calling `computeWages`): forward `includedWeekdays` from the contract's payroll-day-base into the call, mirroring how `method` and `fixedDays` are already forwarded.

## Verification after build

1. Payroll Days Manager → Add "Mon–Sat (6 days)" with `custom_weekdays` + checkboxes 1–6 ticked. Save. It appears in the table with the right description.
2. Open a Client Contract → edit a Resource → Payroll Day Base dropdown lists the new entry. Switching to it updates the "payable days this month" preview to the count of Mon–Sat weekdays.
3. Run a payroll for that contract → gross divides by that count (e.g. 27 in a month with 27 Mon–Sat days), and every per-component / per-duty / PH / OT line scales off the same divisor.
4. Disable the entry in Payroll Days Manager → it disappears from the contract dropdown on the next refetch; existing contracts already pointing at it keep working (id reference is stable).

## Out of scope

- No rename / removal of existing methods.
- No changes to OT divisor (still 26 per prior decision).
- No bulk-migration of existing contracts to the new method.
