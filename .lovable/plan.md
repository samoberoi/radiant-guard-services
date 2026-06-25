
# End-to-End Sync: Control Center → Contract → Employee → Attendance → Payroll → Reports

Goal: one formula pipeline drives every number. Master edits flow into new contracts (snapshot), contracts drive employee salary structures by designation, attendance + additions/deductions drive earned amounts, and Payroll/MIS/Wage Register all read the same row.

## 1. Control Center → Contract sync (snapshot semantics)

- Add `formula_version int` to `allowance_types` and `cost_components`; bump on every formula edit (with `logActivity`).
- Extend `contract_resources` JSONB line items to carry `formula_mode`, `formula_expression`, `formula_version` per allowance / cost component / employer contribution.
- On contract **create/update**, snapshot the current master formula + version onto each line. Existing contracts untouched.
- Add a per-line `v{N}` badge in the contract resource dialog; show an amber dot + "Sync from master" button when the master version is newer. Sync is explicit, never automatic.
- Live preview in the resource dialog already uses `evaluateFormula` — verify it uses the snapshot, not the master, so what-you-see-is-what-payroll-runs.

## 2. Contract → Employee designation sync

- When a candidate is assigned to a unit with a designation, resolve their salary structure from `contract_resources` where `unit_id = X AND designation_id = Y AND contract is active`.
- Add a thin helper `resolveEmployeeStructure(candidateId, periodStart)` used by payroll, invoice, and the employee profile salary tab — single source.
- If no matching resource (designation mismatch / no active contract), surface a clear "No salary structure mapped" banner instead of silently zeroing.

## 3. Attendance + Additions/Deductions → Payroll earned amounts

Refactor `src/lib/payroll-calc.ts → computeWages`:

- Build one `FormulaContext` per employee per period:
  `basic, da, gross, fixed_amount, fixed_days, working_days, payable_days, days_in_month, present, worked, ot, ph, wo, el, pl`.
- For every earning / deduction / employer-contribution line:
  - If `formula_expression` present → `evaluateFormula(...)`.
  - Else → legacy behavior (so untouched contracts produce identical numbers).
- Statutory (EPF / ESI / PT): **custom formula wins if set, else statutory default**. PT slab lookup stays as the fallback path.
- Return per-line `trace { expression, variables, amount }` for the MIS "why" drawer.

Additions / Deductions module integration (in `admin.payroll.$unitId.tsx`):

- **Day adjustments** (`include_in_total_days = true`, with `affects_days_for`) bump the right attendance bucket (P / OT / PH / paid-leave) *before* `computeWages` runs.
- **Money lines** (`include_in_total_days = false`) append as discrete columns:
  - Additions → extra earnings, added to Gross & Net.
  - Deductions → extra deductions, subtracted from Net.
- Both persist into `payroll_runs.snapshot` so the Wage Register reads identical numbers.

## 4. Unified reports (Payroll = MIS = Wage Register = Paysheet)

- Single helper `buildPayrollRow(candidate, resource, attendanceTotals, adjustments, ptCtx)` returning full `WageComputation` + adds/deducts + trace.
- All four views call it:
  - **Payroll detail** (`admin.payroll.$unitId.tsx`)
  - **MIS sheet** (same file, MIS tab)
  - **Wage Register** (`admin.payroll-manager.tsx`)
  - **Paysheet / Invoice** (`admin.invoice.$unitId.tsx`)
- Read rule: **if `payroll_runs.snapshot` exists for the period → use it; else live compute**. Finalized runs are frozen; draft runs always show fresh numbers.
- "Recalculate" button on the run page (draft only) re-runs `buildPayrollRow` against latest attendance + snapshot formulas and updates the snapshot.

## 5. Activity log + safety

- `logActivity` on: formula edit (master), version bump, contract create/update/sync-from-master, addition/deduction create/edit, recalculate, finalize.
- Finalized runs are immutable (guard in the UI + a DB check on snapshot writes).

## Technical notes

**Files edited**
- `supabase/migrations/*` — add `formula_version` to `allowance_types`, `cost_components`; document JSONB keys on `contract_resources` (no shape change).
- `src/lib/payroll-calc.ts` — formula-driven engine + legacy fallback + trace.
- `src/lib/payroll-row.ts` *(new)* — `buildPayrollRow`, `resolveEmployeeStructure`.
- `src/routes/admin.contracts.client-contracts.tsx` — snapshot on save, version badge, "Sync from master" per line.
- `src/routes/admin.payroll.$unitId.tsx` — use `buildPayrollRow`, merge adds/deducts into MIS + Net, persist snapshot, Recalculate button.
- `src/routes/admin.payroll-manager.tsx`, `src/routes/admin.invoice.$unitId.tsx` — read snapshot-first via `buildPayrollRow`.
- `src/routes/admin.allowance-manager.tsx`, `src/routes/admin.cost-component-manager.tsx` — bump `formula_version`, `logActivity`.

**No changes to**
- Finalized `payroll_runs.snapshot` rows.
- RBAC matrix, sidebar IA, attendance entry UI.
- Master data (items, vendors, units, designations).

**Out of scope (call out separately if needed)**
- Reworking attendance capture UX.
- Multi-currency / multi-state PT rule rewrites beyond existing slabs.
- Bulk cross-unit recalc (per-unit only for now).

## Rollout

1. Migration + version bump wiring (smallest, unblocks everything).
2. Snapshot on contract save + badge (no payroll behavior change yet).
3. Formula-driven `computeWages` with legacy fallback — verify zero diff on existing contracts via a typecheck + spot-check one finalized run.
4. `buildPayrollRow` + adopt in Payroll/MIS/Wage Register/Invoice.
5. Recalculate button + activity log.

After each step I'll verify with typecheck and a SQL spot-check on `CON-FPL-2025H1` (Admin Executive, Security Guard) so HRA / LWW / EPF / ESI match expectations before moving on.
