## Goal

Bring the same configurable **Per-Duty Proration** model (amount ÷ chosen day basis × selected duty buckets) that already exists in **Cost Component Manager** to the **Allowance Manager** so statutory/contractual items like **LWF**, **Bonus**, **Ex-Gratia** etc. can be set up as:

```
amount  ÷  <Base Days | Days in Month | Payable Days | Fixed 26>
        ×  <P + any combination of OT / PH / Other Paid days>
```

Then flow this through Contracts → Payroll so exports stay accurate.

## Changes

### 1. Schema — `allowance_types`

Add three nullable columns mirroring `cost_components`:

- `fixed_calc_method text` — `flat` | `per_duty` (default `flat`)
- `fixed_duty_components text[]` — any subset of `p_days`, `ot_days`, `ph_days`, `other_paid_days`
- `fixed_duty_divisor text` — `base_days` | `days_in_month` | `payable_days` | `fixed_26`

No backfill needed; `flat` keeps today's math.

### 2. Allowance Manager UI (`src/routes/admin.allowance-manager.tsx`)

When the allowance is amount-based (not %), show the same Per-Duty block already used in Cost Component Manager:
- Calc Method select (Flat vs Per-Duty Proration)
- Divisor select (Base Days / Days in Month / Payable Days / Fixed 26)
- Duty bucket checkboxes (P, OT, PH, Other Paid) — must select at least one
- Live preview line, e.g. `₹12.50 ÷ Base Days × (P + OT + PH)`

Persist via the existing row mapper.

### 3. Contracts (`src/routes/admin.contracts.client-contracts.tsx`)

Extend the allowance fetch + snapshot mapper to carry `fixedCalcMethod`, `fixedDutyComponents`, `fixedDutyDivisor` (same fields already wired for cost components) into `contract_resources.components` / `benefits` / `employerContributions` JSON.

### 4. Payroll engine (`src/lib/payroll-calc.ts`)

`computePerDutyAmount()` already supports the divisor + bucket logic generically; just ensure it's invoked for allowance lines too (currently only cost-component lines route through it). Specifically:
- In the allowance/benefit branch where `calcType === "fixed"`, branch on `fixedCalcMethod === "per_duty"` and call the same helper instead of using a flat amount.
- Hydrate the new fields in `src/lib/contract-hydrate.ts` so live edits to the Allowance master propagate without re-saving contracts.

### 5. Verification

- Create **LWF** in Allowance Manager: amount ₹12.50, Per-Duty, Divisor = Base Days (26), Buckets = P + OT + PH. Confirm preview reads `₹12.50 ÷ 26 × (P+OT+PH)`.
- Attach to a contract → run unit payroll → LWF line equals `12.50 / 26 × (P+OT+PH)` and the export column matches.
- Same flow for **Management Fee** under Cost Components (already working) — no regression.
- Existing `flat` allowances compute identically.
- Typecheck clean.

## Out of scope

- No change to %-based allowances, EPF/ESI/PT slab logic, additions/deductions managers (those have their own per_duty system).
- No retroactive recompute of historical payroll runs.
