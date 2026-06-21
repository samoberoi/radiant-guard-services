## Goal
Collapse split earning/deduction/contribution columns like `HRA 5%` and `HRA 15%` into a single `HRA` column on the payroll screen and in all three exports (Wage Register, Pay Sheet, MIS). Values stay accurate by summing the underlying per-employee amounts (which are already prorated by attendance).

## Approach

1. **Add a canonicalizer in `src/lib/payroll-calc.ts`**
   - New helper `canonicalComponentName(name)` that strips any trailing percentage / numeric qualifier:
     - `HRA 5%` → `HRA`
     - `HRA 15 %` → `HRA`
     - `Conveyance 10%` → `Conveyance`
     - `Washing (5%)` → `Washing`
   - Regex roughly: trim, then remove a trailing ` [\(\[]?\d+(\.\d+)?\s*%[\)\]]?$`. Idempotent and safe on names without a suffix.
   - Export it so the route can reuse the exact same rule everywhere.

2. **Aggregate per-row in `src/routes/admin.payroll.$unitId.tsx`**
   - Add `mergeByCanonicalName(items)` that walks `[{name, amount}]`, groups by `canonicalComponentName(name)`, sums amounts, and returns a deduped list. The first occurrence's display name (canonical form) wins.
   - Apply it to `wages.components`, `wages.deductions`, and the employer-contributions list **after** `computeWages` but **before** building column headers and row values, so a single normalized shape feeds the table, breakdown, and all exports.
   - Earned-gross stays unchanged (it is already the sum of the originals, so merging line items doesn't change totals).

3. **Column generation (already dynamic) automatically follows**
   - `EARNED_COMPONENT_COLS = collectUnique(r => r.wages?.components)` will now collect canonical names only → one `HRA`, one `Conveyance`, etc.
   - `keepNonZero` continues to drop fully-zero columns.
   - Deduction groups (EPF/ESIC/PT/LWF) are unaffected — they're already merged by `deductionGroups`.

4. **On-screen breakdown drawer**
   - The expandable row that lists each component currently iterates `r.wages.components`. After step 2 it iterates the merged list, so the user sees `HRA 1,250.00` instead of `HRA 5% 312.50` + `HRA 15% 937.50`.

5. **Three exports (Wage Register XLSX, Pay Sheet PDF, MIS XLSX)**
   - All three already read from the same `earnedComponentCols` / row-builder. Because step 2 normalizes the data at the source, every export ends up with a single merged column per base name. No per-export changes needed beyond what step 2 produces.
   - TOTAL row sums merged columns the same way as before.

6. **Verification**
   - Run a quick check script against the FPL May 2026 run: for each employee, sum of merged `HRA` equals the sum of original `HRA 5%` + `HRA 15%`; same for any other split component. Earned Gross, Total Deductions, Net Pay, Employer Cost are unchanged.

## Out of scope
- No changes to contract/cost-component configuration. The split components stay as configured; the merge happens only in the payroll view/exports.
- No changes to EPF/ESIC/PT/LWF logic (already single columns and untouched by the prior fix).
