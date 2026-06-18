## Goal

Make Professional Tax (PT) state-driven and slab-driven everywhere. When the PT deduction is attached to a contract, it should pick up the unit's state automatically. When payroll runs, every employee's PT should be looked up from `professional_tax_slabs` using:

```text
state    = unit.billing_state (with unit.billing_pincode for region disambiguation)
gender   = candidate.gender (fallback "all")
salary   = earned gross for the period
```

The matching slab's `tax_per_month` becomes that employee's PT. Then everything downstream — payroll dropdown, totals, invoice, exports — reflects the resolved PT and the corrected total deductions.

## Behaviour (example: Maharashtra male)

```text
earned gross < 7,500       → PT 0
7,501 ≤ earned ≤ 10,000    → PT 175
earned ≥ 10,001            → PT 200
```

Female / "all" / other states are resolved from the same table the Professional Tax Manager already manages — no rules are hardcoded.

## Changes

### 1. New shared PT resolver (`src/lib/payroll-calc.ts`)
- Add `resolvePtAmount({ state, pincode, gender, earnedGross, ranges, slabs })`.
- Reuse `resolvePt` from `src/lib/pt-lookup.ts` to pick state+region from pincode (fallback to unit state when pincode resolution fails).
- Filter slabs by gender (`gender` match OR `all`).
- Find the slab where `salary_min ≤ earnedGross AND (salary_max IS NULL OR earnedGross ≤ salary_max)`.
- Return `{ amount, slabId, regionLabel, source: "resolved" | "no_match" | "missing_state" }`.
- Add `applyPtToWageComputation(wages, ptAmount)` that:
  - Replaces or injects a deduction row named "Professional Tax (PT)" with the resolved amount.
  - Recomputes `totalDeductions` and `netPay` (same shape as `applyEsiToWageComputation`).

### 2. Hook PT into payroll computation (`src/routes/admin.payroll.$unitId.tsx`)
- Load `professional_tax_slabs` and `pincode_ranges` once for the page (React Query, same pattern as existing fetches).
- For each roster row, after `computeWages` + `applyEsiToWageComputation`, call `applyPtToWageComputation` using:
  - Unit billing state / pincode
  - Candidate gender (fallback `"all"` if missing, treat unknown as "all")
  - The post-additions `earnedGross`
- Persisted payroll output, dropdown deduction rows, totals row, CSV/XLSX/PDF all derive from the same wages object, so they update automatically once the function is wired in.
- Contract column for the PT row: show `—` (the contract doesn't carry a fixed PT). Earned column: show resolved PT.

### 3. Wire PT into invoice + exports
- `src/routes/admin.invoice.$unitId.tsx`: route already consumes the shared wages object — pass the same slabs + ranges so PT is resolved per row before billing-side totals are computed.
- `src/lib/csv-export.ts`: no per-row PT logic lives here; it formats whatever the caller passes. Verify the caller (payroll + invoice) is feeding the post-`applyPtToWageComputation` rows so the exported PT and Total Deductions match the UI.

### 4. Contract setup UX (`src/routes/admin.contracts.client-contracts.tsx`)
- When the synthetic PT deduction is attached:
  - Look up `unit.billing_state` and store it on the deduction row metadata (display-only field "State: Maharashtra").
  - Amount column shows `Per state slab` (existing behaviour), no fixed rupee amount.
  - Tooltip: "Calculated per employee from the PT manager using unit state, employee gender, and earned gross."
- Cost Component Manager PT row (if any) keeps the same "Per state slab" treatment — no fixed amount.

### 5. Edge cases
- `unit.billing_state` missing → PT = 0, surface a small inline warning on the payroll row (`PT: state not set on unit`).
- Candidate gender missing → treat as `"all"`; if state requires gendered slabs (e.g. Maharashtra) and no `"all"` row exists, PT = 0 with the same inline warning.
- Earned gross outside all slab ranges → PT = 0.
- Unit billing pincode missing → fall back to first non-excluded state-level slab set.

### 6. Verification before reporting back
- Open Kids Clinic payroll for May; confirm:
  - Santosh (Maharashtra, male, earned gross ₹19,895) → PT ₹200, total deductions = EPF ₹1,800 + ESI ₹150 + PT ₹200 = ₹2,150, net ₹17,745.
  - At least one female employee on the same unit reflects the female Maharashtra slab.
  - Dropdown deduction row, totals row, invoice view, CSV and PDF all agree.
- Spot-check a non-Maharashtra unit (different state) to confirm slab lookup uses the unit's state, not a hardcoded one.

## Out of scope

- February top-up rule for states that levy a higher PT in February (not requested).
- Editing PT slabs themselves — that already lives in Professional Tax Manager and is untouched.
