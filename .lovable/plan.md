
# End-to-End Contract → Payroll Sync

Wire the formula engine + control-center components into the payroll pipeline so that whatever is configured in Allowance Manager / Cost Component Manager flows into contracts, then into per-employee payroll based on attendance (P, OT, PH, paid leaves) and the Additions/Deductions module — and the same numbers appear in Payroll, MIS view, and Wage Register.

## What's wrong today

- `src/lib/payroll-calc.ts → computeWages` is hard-coded:
  - Earnings prorate as `componentAmount × P / baseDays` (Phase 2 formula engine is NOT called).
  - PH = `gross/baseDays × PH_count`, OT = `(otBase/baseDays/8) × otHours` — fixed formulas, ignoring any custom formula on the allowance.
  - Deductions/contributions follow legacy name-based heuristics (Uniform/LWF fixed, EPF/ESI special rules) instead of the configured formula.
- `contract_resources` snapshots `amount / calc_type / percentage / base_components` but NOT `formula_mode / formula_expression / formula_version`, so contracts can't carry per-component formulas.
- New contracts created after a master edit don't pull the latest formula; payroll has nothing to evaluate.
- Additions/Deductions rows already exist (Phase 1) but `admin.payroll.$unitId.tsx` doesn't merge them into Net Pay or the MIS grid as first-class lines.
- MIS sheet and Wage Register read different fields (MIS pulls live, Wage Register reads `payroll_runs.snapshot`) → they can drift.

## Plan

### 1. Snapshot formulas onto contracts
- Migration: add `formula_mode text`, `formula_expression text`, `formula_version int` to `contract_resources` line items (extend the existing JSONB snapshots for allowances, cost components, employer contributions).
- Update contract create/update in `admin.contracts.client-contracts.tsx` to copy `formula_mode / formula_expression / formula_version` from the master at the moment of save (snapshot semantics — existing contracts untouched, new contracts pick up latest).
- Show a small "v{N}" tag next to each line so drift from master is visible.

### 2. Drive payroll-calc from the formula engine
Refactor `computeWages` in `src/lib/payroll-calc.ts`:
- Build a `FormulaContext` per employee per period:
  ```
  basic, da, gross, fixed_amount,
  fixed_days (=baseDays), working_days, payable_days,
  present (P), worked (P + otherPaid), ot (otDays), ph (phDays),
  wo, el, pl
  ```
- For every component / benefit / deduction / employer-contribution line on the contract:
  - If it has a `formula_expression`, evaluate it via `evaluateFormula` and use the result.
  - Else fall back to the existing legacy behaviour (so old contracts keep producing identical numbers).
- Keep ESI/EPF/PT statutory overrides as a final post-pass (they're regulatory, not contract-formula territory) but make them opt-out via a `formula_mode = 'statutory'` marker so a user can force a custom formula if they choose.
- Return a per-line `trace { expression, variables, amount }` so the MIS drawer can show "why".

### 3. Fold Additions / Deductions into the run
In `admin.payroll.$unitId.tsx`:
- Already-fetched additions/deductions: split into
  - **Day adjustments** (`include_in_total_days = true`) → bump the correct attendance bucket (`affects_days_for`) BEFORE `computeWages` runs (this part exists; verify it's correct for all 4 buckets).
  - **Money lines** (`include_in_total_days = false`) → append as discrete lines in the MIS grid:
    - Additions → extra earnings column group, added to Gross & Net.
    - Deductions → extra deductions column group, subtracted from Net.
- Persist them into `payroll_runs.snapshot` so the Wage Register reads the same numbers.

### 4. Unify MIS / Payroll / Wage Register
- Payroll detail (`admin.payroll.$unitId.tsx`), MIS sheet (already in same file), and Wage Register (`admin.payroll-manager.tsx` if present, or wherever the register lives) should all read from one helper: `buildPayrollRow(candidate, contractResource, totals, adjustments, ptCtx)` returning the full `WageComputation` + adds/deducts.
- Wage Register switches to reading the saved `payroll_runs.snapshot` row when present; falls back to live compute when the run isn't finalized.

### 5. Recalculate button + activity log
- Add "Recalculate" button on the run page that re-runs `buildPayrollRow` against current attendance + master formulas (only allowed when run is not finalized).
- `logActivity("Payroll", ...)` on: formula edit (Allowance/Cost Manager), contract create/update, addition/deduction create/edit, recalculate, finalize.

## Technical Notes

- **Schema migration** — single migration that:
  - Adds the 3 formula columns to `contract_resources` snapshot JSON shape (no table-level columns needed if the snapshot is JSONB — just document the keys).
  - Backfills `formula_mode = NULL` for existing rows so legacy fallback kicks in.
- **Files edited**:
  - `src/lib/payroll-calc.ts` — formula-driven engine, trace output, fallback path.
  - `src/lib/contracts/...` and `admin.contracts.client-contracts.tsx` — snapshot formula on save, version tag display.
  - `src/routes/admin.payroll.$unitId.tsx` — merge adds/deducts into MIS rows + Net, persist into snapshot, recalc button.
  - `src/routes/admin.payroll-manager.tsx` (and any wage-register route) — read from snapshot.
  - `src/routes/admin.allowance-manager.tsx`, `src/routes/admin.cost-component-manager.tsx` — version bump on formula edit, activity log.
- **No changes to**: finalized runs, RBAC matrix, sidebar IA.

## Open Questions / Defaults

- Statutory overrides (ESI/EPF/PT) stay automatic by default — users can override per component by editing the formula. OK?
- Recalculate scope: per-unit only (not cross-unit bulk) for MVP.
- Wage Register: I'll locate the actual register route during build; if you have a preferred file name, tell me.
