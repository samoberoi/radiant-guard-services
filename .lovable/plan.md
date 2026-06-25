## Goal

Fix two miscalculations in the payroll engine (`src/lib/payroll-calc.ts`) and its caller (`src/routes/admin.payroll.$unitId.tsx`):

1. **Paid Holiday (PH)** must honour the amount entered in Payroll Additions, not recompute from `contractGross / baseDays`.
2. **Overtime (OT)** must use a fixed divisor of `26` and exclude only the Uniform allowance.

## Changes

### 1. Paid Holiday uses the addition amount

In `admin.payroll.$unitId.tsx` (PH addition handling, ~lines 384-394):
- For every PH-type addition row, sum the addition amount (`amount × installments` consistent with existing logic) into a new per-candidate map `phCashByCandidate`.
- Continue to bump `phDisplayCountByCandidate` so the **PH Days** column still shows the count.
- Stop letting PH additions contribute to `dayAdjustmentByCandidate.phDays` (so `computeWages` doesn't auto-pay them).

In `payroll-calc.ts` (`computeWages`):
- Add an optional `phOverrideAmount?: number` parameter (passed by the caller when a PH cash override exists).
- When provided, use it as the `Paid Holiday` line amount instead of `perDayRate × phCount`.
- When not provided, keep current behaviour (so attendance-only PH still pays via `perDayRate`).

At the call site, pass `phCashByCandidate.get(c.id)` into `computeWages`.

Result: Sambhaji's PH line shows exactly ₹1003 when the user enters ₹1003 in Additions.

### 2. Overtime uses ÷26 and excludes Uniform

In `payroll-calc.ts` (OT block, ~lines 621-647), replace the current logic with:

```
otExcluded = sum of components whose canonical name matches /uniform/i
otBase     = contractGross - otExcluded
perDutyOt  = otBase / 26          // hard-coded, not baseDays
otAmount   = round2(perDutyOt × totals.otDays)
```

Remove the `includeInOt` flag branch entirely for this rule (per spec). Keep the `Overtime` line emission and the `otBaseAmount / perDutyOtAmount / otDuties / totalOtAmount` fields unchanged in shape — only their values change.

## Out of scope

- No UI / column / export-header changes.
- No DB migration.
- Other components (HRA, ESI, EPF, PT, deductions) remain untouched.

## Verification

- Recompute Sambhaji Tukaram Mastake: PH line = ₹1003 (matches addition); OT line = `(26076 − uniform) / 26 × ot_days`.
- Run typecheck; spot-check the payroll table renders without console errors.
