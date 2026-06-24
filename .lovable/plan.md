## Goal
Make every **Fixed Amount** cost component support a configurable per-duty proration formula so components like *WC Policy* can be calculated as:

```
per_duty_amount = configured_amount / base_days
final_amount    = per_duty_amount × (sum of selected duty counts)
```

The configuration must be reusable on any future fixed-amount component, override-able per contract line, and flow through payroll calculation + every payroll export.

## 1. Schema (one migration)

Add two columns to `cost_components` and mirror them on contract resource JSONB lines:

- `fixed_calc_method` text NOT NULL DEFAULT `'flat'` CHECK in (`'flat'`, `'per_duty'`)
- `fixed_duty_components` text[] NOT NULL DEFAULT `'{}'` — which duty buckets sum into "total duties" (allowed values: `p_days`, `ot_days`, `ph_days`, `other_paid_days`)

Backfill: leave all existing rows as `flat` (no behaviour change). Divisor is always the contract resource's existing **Base Days** (Payroll Day Base) — no new divisor field needed.

Contract resource JSONB rows (`contract_resources.components / deductions / employer_contributions`) gain the same two fields per line, copied from master when added and editable per line.

## 2. Cost Component Manager UI (`admin.cost-component-manager.tsx`)

When **Calculation Type = Fixed Amount**, render a new "Fixed Amount Formula" sub-section:

- Radio / select: **Flat (use amount as-is)** ‧ **Per-Duty Proration**
- When Per-Duty selected, show:
  - Read-only helper: `per duty = amount ÷ Base Days (from contract resource)`
  - Multi-select checkboxes for duty buckets to include in "Total Duties":
    - ☐ P Days (present)
    - ☐ OT Days
    - ☐ PH Days
    - ☐ Other Paid Days
  - Live preview line, e.g. *"₹200 ÷ 26 × (P + OT + PH) = ₹/duty × total duties"*

`buildDescription()` updated so the list page shows the formula summary.

## 3. Contract editor (`admin.contracts.client-contracts.tsx`)

When a fixed-amount component is added to a resource, copy `fixed_calc_method` + `fixed_duty_components` from master onto the line. Show inline controls (compact select + chips) so the formula can be overridden per contract without touching the master.

## 4. Payroll engine (`src/lib/payroll-calc.ts`)

Extend `BenefitLike` / `WageComponent` with:
- `fixedCalcMethod?: 'flat' | 'per_duty'`
- `fixedDutyComponents?: string[]`

Replace today's `isFixedItem` branch:

```text
if calc_type = fixed AND fixedCalcMethod = 'per_duty':
    perDuty   = configuredAmount / baseDays
    totalDays = Σ(totals[bucket] for bucket in fixedDutyComponents)
    amount    = round2(perDuty × totalDays)
elif deductionCalcType = 'fixed_amount' (flat):
    amount    = configuredAmount        // unchanged
else:
    amount    = configuredAmount × earnedRatio  // unchanged
```

`totals` already exposes `pDays`, `otDays`, `phDays`, `otherPaidDays` from `summarizeAttendance` (lines 95–110), so no new attendance plumbing is needed.

Apply the same formula path for fixed-amount **earnings** (components used as earnings, e.g. Management Fee if reconfigured), so the rule is uniform across earnings / deductions / employer contributions. EPF and statutory ESI overrides keep their current precedence (run after this scaling).

## 5. Payroll screen + exports

- `admin.payroll.$unitId.tsx`: per-row tooltip / breakdown shows `amount ÷ baseDays × (P+OT+PH+…) = final` for any per-duty line.
- Wage Register / Pay Sheet PDF / CSV / MIS: render the calculated `amount` field — no schema change, but verify each export reads the engine output (it already does) so WC-Policy-style rows show the prorated value, not the flat ₹200.

## 6. Backward compatibility

- Existing rows default to `flat` → identical output to today.
- Legacy name-based `isFixedItem` heuristic (uniform/lwf) is kept as a final fallback for older contract JSONB rows missing the new fields, so historical payroll runs reproduce.

## 7. Out of scope

Attendance capture, payroll-day-base UI, allowance master, and OT-base logic are unchanged. Only Fixed-Amount calculation gains the per-duty option plus its plumbing through contracts and exports.

Approve and I'll ship the migration + code in one pass.