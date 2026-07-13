
## What I'll build (single shipping pass)

### 1. Disability flag on candidate → ESI ₹25,000 ceiling
- Migration: add `is_disabled BOOLEAN DEFAULT false` to `public.candidates`.
- Wire the flag through: candidate profile edit form gets a "Person with disability (ESI ceiling ₹25,000)" checkbox.
- Payroll + invoice pass `isDisabled` into the existing `applyEsiToWageComputation` (the parameter already exists in the engine).

### 2. EPS / EDLI / Admin split (single "EPF" contract line → 4 employer sub-lines)
- Engine (`payroll-calc.ts`): when a contract row is tagged EPF, expand the single employer contribution into 4 tracked lines in the result:
  - **EPF employer** 3.67% (of capped basic+DA)
  - **EPS** 8.33%, capped at ₹1,250
  - **EDLI** 0.5%, capped at ₹75
  - **EPF Admin** 0.5%, min ₹500
- Total employer cost is unchanged (still ~13%), but the paysheet + invoice now show the statutory breakdown.
- Employee side (12%) stays as-is.

### 3. GST breakdown on-screen (CGST/SGST vs IGST from company state)
- Migration: create `public.org_settings` (singleton) with `company_gstin`, `company_state`, `company_state_code`. Seed one row.
- New tiny admin page `admin.org-settings.tsx` (in Control Center) to edit company GSTIN + state.
- Invoice route: compare unit `billing_state` vs company state — if same, CGST+SGST split (each half of GST %), else IGST full. Render breakdown in the invoice header and totals card, not just Tally export.

### 4. Billing-type variants (man_days / man_hours / man_months / lumpsum)
- Migration: add `code TEXT` to `billing_types` with values `man_days | man_hours | man_months | lumpsum`; backfill existing rows by name; add `code` to Billing Type Manager UI (readonly-ish select).
- Contracts already reference `billing_type_id`. Invoice engine (`admin.invoice.$unitId.tsx`) branches per resource's contract billing_type:
  - `man_days` (current) — per-day rate × attended (fractional-day-aware).
  - `man_hours` — per-hour rate × (attended-hours + OT hours), where per-hour = monthly / (baseDays × dutyHours).
  - `man_months` — flat monthly, prorated only by LOP (baseDays−pDays)/baseDays, ignores partial-attendance.
  - `lumpsum` — flat contract-line amount, no attendance math.
- Line-level indicator showing which mode was applied so the operator can verify.

### 5. Regression re-check
After all four land, I re-run the calculation sanity script (scenarios A–D from last audit + one man-hours + one man-months + one intra-state GST + one PwD-ESI) and paste the pass/fail table.

## Technical details
- Files touched: 2 migrations, `payroll-calc.ts`, `admin.invoice.$unitId.tsx`, `admin.payroll.$unitId.tsx`, `admin.billing-type-manager.tsx`, `admin.candidates.$id.details.tsx`, new `admin.org-settings.tsx`, control center link.
- All engine changes remain opt-in: missing billing_type code → falls back to `man_days`; missing company state → falls back to IGST-only (current behavior).
- No breaking changes to already-approved payroll snapshots (they hold their own frozen amounts).

## Not in scope
- Full GST invoice number series / e-invoice / IRN generation.
- Statutory PF challan file export.
- Historical payroll re-computation (existing rows keep their snapshot values).
