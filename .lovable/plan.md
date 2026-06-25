
# Customizable Payroll Calculation Engine + MIS-style Payroll View

## 1. Hybrid Formula Engine (shared by Allowance Manager & Cost Component Manager)

Add a reusable `FormulaBuilder` component with two modes:

**Preset mode (default)** — visual row builder:
- **Base**: `Basic`, `DA`, `Basic + DA`, `Gross`, `Fixed Amount` (manual input), `Previous Component` (reference another allowance/cost by code)
- **Operator**: `% of`, `× per day`, `÷ by`, `flat`
- **Divisor (day basis)**: `Fixed Days (client)`, `Fixed Days (month: 26/28/30/31)`, `Working Days`, `Payable Days`
- **Multiplier (duty basis, multi-select with +)**: `Present Duties`, `Worked Duties`, `OT Duties`, `PH Duties`, `Weekly Off`, `Earned Leave`, `Paid Leave`
- **Cap / Floor** (optional): min/max amount
- Worked example for the user's WC case: Base=`Fixed Amount 200`, Operator=`÷ by`, Divisor=`Fixed Days (client)`, Multiplier=`Present + OT + PH`.

**Advanced mode** — free-form expression with variables:
`{basic} {da} {gross} {fixed_amount} {fixed_days} {working_days} {payable_days} {present} {worked} {ot} {ph} {wo} {el} {pl}` and operators `+ - * / ( ) min() max()`. Live evaluator with sample inputs for validation; rejects unknown tokens.

Stored as JSONB `formula` on `allowance_types` and `cost_components` (existing `calculation_type` column kept for back-compat; new rows default to `formula`). Add `formula_mode` (`preset` | `advanced`) and `formula_version` (int, bumped on every edit for audit).

## 2. Sync Rules

- **Master edit** → only **new contracts** snapshot the updated formula. Existing `contract_resources` keep their snapshot (already the pattern in `client_contracts`). Show a "version X" tag on contract lines so users can see drift.
- **Payroll runs** read from the contract snapshot, never master. Guarantees finalized runs stay reproducible and a fix in Cost Manager only affects contracts created after the edit (and any payroll generated from those contracts).
- **Sidebar nav**: Allowance Manager and Cost Component Manager stay where they are; the formula edit dialog gets the new builder.

## 3. Payroll Additions & Deductions (left-panel tabs under Payroll)

Restructure `/admin/payroll`:
- Add left-panel tabs: **Runs**, **Additions**, **Deductions**.
- **Additions** and **Deductions** tabs are the existing pages (`admin.additions.tsx`, `admin.deductions.tsx`) re-mounted inside payroll, edited there, and writes invalidate payroll queries so they reflect immediately in the open run.
- **Employee picker** on both pages: searchable **multi-select** (Command palette + checkboxes; "Apply to N employees" creates one row per selected employee).
- **New fields** on `additions` / `deductions`:
  - `entry_mode`: `days_x_per_day` | `lumpsum`
  - `days` (numeric), `per_day_amount` (numeric) — computed `amount = days × per_day_amount` when in days mode
  - `include_in_total_days` (bool) — when true, `days` adds to that employee's payable-days count for the run (and cascades into any formula using `{payable_days}`)
  - `affects_days_for`: array of `present|worked|ot|ph` so the user controls which bucket the days flow into

## 4. MIS-style Payroll Detail View (per unit)

Replace the current summary table on `admin.payroll.$unitId.tsx` with a wide, horizontally scrollable MIS sheet. One row per employee, frozen left columns (Emp Code, Name, Designation), then column groups:

```text
| Attendance       | Earnings              | Deductions            | Adjustments      | Totals  |
| FD P A WO PH OT  | Basic DA HRA <allow…> | PF ESI PT LWF <cost…> | Add+ Ded- Notes  | Gr Net  |
```

- Columns derived dynamically from the active contract's allowance + cost components (so every configured component gets its own column).
- Sticky header, sticky first 3 columns, tabular-nums, CSV/XLSX export of the exact grid, per-column totals row at the bottom.
- Row click → side drawer with full formula trace: each component's formula, variable values, and computed amount (so when a number looks wrong you can trace it to the cost component and jump to fix it).

## 5. Payroll Recalculation Flow

- Run-level "Recalculate" button re-evaluates every employee using the formula engine against current attendance + adds/deducts. Finalized runs are read-only; recalc requires reopening.
- Activity log entries on every formula edit, addition/deduction edit, and recalc (per Core memory rule).

## Technical Details

**Schema (migration):**
- `allowance_types`: add `formula jsonb`, `formula_mode text`, `formula_version int default 1`.
- `cost_components`: same three columns.
- `additions`, `deductions`: add `entry_mode text default 'lumpsum'`, `days numeric`, `per_day_amount numeric`, `include_in_total_days bool default false`, `affects_days_for text[]`.
- `contract_resources`: ensure each line snapshots `{allowance_id, formula, formula_version}` and `{cost_id, formula, formula_version}` JSON (extend existing snapshot columns).
- GRANTs preserved for `authenticated` + `service_role`; RLS policies unchanged.

**New lib:** `src/lib/formula-engine.ts`
- `evaluateFormula(formula, ctx)` where `ctx` = `{ basic, da, gross, fixed_amount, fixed_days, working_days, payable_days, present, worked, ot, ph, wo, el, pl }`.
- Preset compiler converts JSONB tree → expression; advanced mode uses a safe parser (no `eval`; use `expr-eval` or hand-written shunting-yard — `expr-eval` is ~5KB and Worker-safe).
- Returns `{ amount, trace[] }` so the detail drawer can show steps.

**New component:** `src/components/FormulaBuilder.tsx` — preset rows + advanced textarea + live preview with editable sample inputs.

**Edited files:**
- `src/routes/admin.allowance-manager.tsx`, `src/routes/admin.cost-component-manager.tsx` — replace existing calc-type select with `<FormulaBuilder/>`.
- `src/routes/admin.payroll.tsx` — add Runs/Additions/Deductions tabs in the left panel.
- `src/routes/admin.additions.tsx`, `src/routes/admin.deductions.tsx` — multi-select employee picker, days/per-day inputs, include-in-days toggle.
- `src/routes/admin.payroll.$unitId.tsx` — new MIS grid + trace drawer + export.
- `src/lib/payroll-calc.ts` — switch to formula engine; honor `include_in_total_days` and `affects_days_for`.
- `src/lib/contracts/...` — snapshot formula + version when creating/updating contract resources.

**Out of scope (will not touch):** existing finalized payroll runs, RBAC matrix, sidebar IA beyond the Payroll tabs.

## Open Questions Left to Defaults

- Advanced formula library: defaulting to `expr-eval` (small, Worker-safe). Swap on request.
- Detail-view export: defaulting to CSV in MVP; XLSX can follow if needed.
