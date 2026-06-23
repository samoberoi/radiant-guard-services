## Goal
Replace the hard-coded "Uniform Allowance" OT exclusion and the regex-based "fixed deduction" list with two explicit, user-controlled flags configured in the Control Center, and wire them through the payroll engine + every payroll export.

## 1. Schema changes (one migration)

- `allowance_types`: add `include_in_ot boolean NOT NULL DEFAULT true`.
- `cost_components`: add `deduction_calc_type text NOT NULL DEFAULT 'earned_salary'` with a CHECK in (`'earned_salary'`, `'fixed_amount'`).
- Backfill: set `include_in_ot = false` for any existing allowance whose name matches `uniform` (preserves today's behaviour). Set `deduction_calc_type = 'fixed_amount'` for existing components whose name matches `uniform`, `lwf`, or `labour welfare` (preserves today's `isFixedItem` rule).
- These flags also need to travel with each contract resource. The contract editor stores resource components/deductions as JSONB rows. Add the same two fields to those JSONB rows when the contract is created/edited so payroll doesn't need a second lookup, and backfill existing contracts from the master tables.

## 2. Allowance Manager UI (`admin.allowance-manager.tsx`)
- New "Include in OT Calculation" Switch in the create/edit dialog (default ON).
- Show an "OT" badge / column in the list when disabled, so it's obvious which allowances are excluded.
- Persist via existing insert/update mutations; keep `logActivity` calls as today.

## 3. Cost Component Manager UI (`admin.cost-component-manager.tsx`)
- New "Deduction Calculation Type" Select with two options: **Earned Salary Based** / **Fixed Amount** (default Earned Salary Based).
- Only show the field for components used as deductions / employee contributions (component already has a "type" classification — reuse it; if not, show it for all and document that it only applies to deductions/contributions).
- Persist via existing insert/update mutations; keep `logActivity`.

## 4. Contract editor (`admin.contracts.client-contracts.tsx`)
- When adding an allowance line, copy `include_in_ot` from the master.
- When adding a deduction / employee contribution line, copy `deduction_calc_type` from the master.
- Allow override per contract (so one client can mark Uniform "include in OT" without changing the global default). Show both as inline controls on each line.

## 5. Payroll calculation engine (`src/lib/payroll-calc.ts`)
Replace today's two heuristics:

**OT base (currently `contractGross − uniform`):**
```
otBase    = contractGross − Σ(component.amount where include_in_ot = false)
perDutyOT = otBase / baseDays            // new: per-duty rate
otAmount  = perDutyOT × otDuties
```
Keep the existing hour-based path as a fallback when the resource captures OT in hours rather than duties, gated on which field is populated. OT continues to be appended as its own line (`Overtime`) and never inflates per-component earnings.

**Deduction / contribution scaling (currently regex `isFixedItem`):**
```
if line.deduction_calc_type = 'fixed_amount' → amount = contractAmount (no proration)
else                                          → amount = contractAmount × earnedRatio
```
EPF/ESI statutory overrides keep their current precedence (they run after scaling, same as today).

Expose new fields on the returned payroll row so the UI/exports can show them:
`otDuties`, `otBaseAmount`, `perDutyOtAmount`, `totalOtAmount`.

## 6. Payroll screen + exports
- `admin.payroll.$unitId.tsx`: add the OT block (Total Duties / Worked / Absent / OT Duties / OT Base / Per-Duty OT / Total OT) in the salary breakdown panel. Earned salary section keeps Net Salary at the bottom.
- `csv-export` / Wage Register / Pay Sheet PDF / MIS: add the four OT columns and ensure fixed-amount deductions render at their full configured amount regardless of attendance.

## 7. Out of scope
Organization → Unit → Contract → Resource flow, attendance capture, and the salary-structure UI are unchanged. Only the two new flags, the payroll math that consumes them, and the exports that display the results are touched.

## Technical notes
- Migration runs first (adds columns + backfill). Code that reads the new fields ships after the regenerated Supabase types land.
- `payroll-calc.ts` keeps backward compatibility: if a resource line has no `include_in_ot` / `deduction_calc_type` (older contracts not yet re-saved), fall back to the current regex behaviour so historical payroll runs reproduce.
- All mutations continue to call `logActivity` with the existing module labels ("Allowance Manager", "Cost Component Manager") per the project core rule.

Approve and I'll ship migration + code in one pass.