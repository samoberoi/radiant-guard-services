## Goal

In **Control Center → Cost Component Manager**, the "Per-Duty Proration" mode currently hard-divides by **Base Days** (26). The user wants the divisor to be **customizable per component** so Management Fee (and any other component) can be set as:

```
amount ÷ <chosen day basis> × <selected duty buckets>
```

Example requested: `amount ÷ Total Days in Month × Total Working Duties`.

## Changes

### 1. Schema (`cost_components` + `contract_resources` snapshot)

Add one nullable column:
- `fixed_duty_divisor text` — one of `base_days` | `days_in_month` | `payable_days` | `fixed_26` (default `base_days` to preserve current behaviour).

No data backfill needed; `NULL`/`base_days` keeps today's math.

### 2. Cost Component Manager UI (`src/routes/admin.cost-component-manager.tsx`)

When `calc_type = fixed` and `fixed_calc_method = per_duty`, show a new "Divisor" select beside the existing duty-bucket checkboxes:

- **Base Days** (current default, ÷ baseDays e.g. 26)
- **Total Days in Month** (÷ calendar days of the payroll period)
- **Payable Days** (÷ P + Other Paid days)
- **Fixed 26**

Update `buildDescription()` so the row subtitle reads e.g. `₹10,000 ÷ Days in Month × (T) · per-duty` so the user sees exactly which divisor is in effect.

Persist via `toRow()` / `rowToItem()`.

### 3. Payroll engine (`src/lib/payroll-calc.ts`)

`computePerDutyAmount()` currently does:

```ts
const perDuty = baseDays > 0 ? configured / baseDays : 0;
```

Replace with a divisor lookup driven by the new field:

```ts
const divisor = (() => {
  switch (i.fixedDutyDivisor) {
    case "days_in_month": return periodDayCount;
    case "payable_days":  return basePaidDays;
    case "fixed_26":      return 26;
    case "base_days":
    default:              return baseDays;
  }
})();
const perDuty = divisor > 0 ? configured / divisor : 0;
```

Thread `fixedDutyDivisor` through the `BenefitLike` / `WageComponent` types and the contract-hydrate snapshot (`src/lib/contract-hydrate.ts`) so it flows from `cost_components` → `contract_resources.components` → `computeWages`.

Remove the special-case comment block that says "Management Fee is intentionally NOT fixed"; once Management Fee is configured as `per_duty` with divisor = `days_in_month` and bucket = `p_days + other_paid_days`, the engine handles it generically — no name-based logic needed.

### 4. Verification

- Edit Management Fee → set Per-Duty, Divisor = **Total Days in Month**, Buckets = **Working Duties (P + Other Paid)**, Amount = ₹X.
- Re-run a unit payroll and confirm the Management Fee line equals `X / days_in_month × T` and exports correctly.
- Existing rows without `fixed_duty_divisor` continue computing identically (÷ baseDays).
- Typecheck clean.

## Out of scope

- No UI rework outside the Per-Duty section.
- No changes to PH, OT, EPF/ESI/PT logic.
- No retroactive recomputation of historical payroll runs.
