## Goal
End-to-end audit and fix of payroll computation + the four surfaces (on-screen table, breakdown drawer, Wage Register XLSX, Pay Sheet PDF, MIS XLSX) so every number is derived from contract config + attendance, AND every table is collapsed to one column per canonical component (no `HRA 5%`/`HRA 15%`/`ESIC 3.25%` splits).

## Column-simplification rule (applies everywhere)
For every earning, deduction, and employer-contribution column in every table/export:
- Canonicalize the name by stripping trailing percentages and numeric qualifiers: `HRA`, `HRA 5%`, `HRA 15 %`, `HRA (10%)`, `HRA-5` → all become `HRA`.
- Sum the prorated amounts of every variant into the single canonical column.
- The TOTAL row sums the merged column directly.
- Applies to: earned components (HRA, DA, Special, Conveyance, Washing, LWW…), deductions (EPF, ESIC, PT, LWF, Uniform…), employer contributions (ER EPF, ER ESIC, ER LWF, Bonus, Gratuity, Mgmt Fee…), and any future component the user adds.

This rule is enforced in one place (`mergeByCanonicalName` in `src/lib/payroll-calc.ts`) and consumed by the route once, so every surface stays in sync automatically.

## What I'll audit (in order)

### 1. Source of truth — contract → resource → component
- Re-read `contract_resources` rows and verify the route loader maps each cost component / benefit / deduction / employer contribution with `calcType`, `percentage`, `baseComponents`, `capAmount`, `capFlatAmount`, and `payroll_day_base_id` intact (no field silently dropped).
- Confirm `payroll_day_bases` row resolves correctly — drives `baseDays`, which is what makes the "1,800 vs 2,025.60" class of bugs go away.

### 2. Earned values (proration)
- For every cost component: earned = `contractAmount × T Days ÷ baseDays`.
- Fixed-flagged items (`Uniform`, `LWF`) stay at contract amount, do not prorate.
- Management Fee DOES prorate (per user description).
- Percentage-based benefits recompute against their earned base components, not the contract base.

### 3. Statutory deductions
- **EPF**: 12% of (Basic + DA + Special Allowance per contract config's `baseComponents`), wage-ceiling from `capAmount`/`capFlatAmount`. Verify the ₹2,025.60 case holds for everyone, no stray ₹1,800 cap anywhere.
- **ESIC**: 0.75%/3.25% on (earned gross − earned washing − earned conveyance), ceiling ₹21,000 earned gross, ceil-to-rupee. First ESI row only; later ESI rows zeroed.
- **PT**: resolved from `professional_tax_slabs` by state + pincode region + gender + earned gross, with gender fallback to "all".
- **LWF**: flat per state from `labour_welfare_funds`, never prorated.

### 4. Employer contributions
- ER EPF, ER ESIC, ER LWF, Management Fee, Bonus, Gratuity, Leave Encashment — each recomputed from its own config (percentage of declared base, or fixed).
- Total Employer Contributions = sum of merged employer-contribution list.
- Employer Cost (CTC) = Earned Gross + Total Employer Contributions.

### 5. Single source feeds all surfaces
- On-screen table, expandable breakdown drawer, Wage Register XLSX, Pay Sheet PDF, MIS XLSX all read from one merged-and-computed `wages` object per row — no per-export recalculation.
- Re-verify canonical merge collapses every `*%` variant in all five surfaces.
- TOTAL row sums merged columns directly.

### 6. Edge cases to assert
- Zero attendance → all earned 0, deductions 0, net 0, ER cost 0.
- Missing contract → row labeled "no contract", no NaN in exports.
- Extra additions (bonus from Additions module) → folded into earned gross before ESI/PT recompute, then PT re-resolved.
- Multiple designation lines per candidate → primary line carries additions/deductions; secondary does not double-count.
- Earned gross > ESI ceiling → ESI 0 for both ER and EE.
- Contract gross 0 → ratio 0, no division-by-zero.

### 7. Verification harness
- Write a one-off node script that loads the latest payroll run (FPL May-2026), iterates every row, and re-derives EPF/ESI/PT/LWF + every cost component + employer contributions from raw DB rows, then diffs against `computeWages` output. Any mismatch logs employee code + component name.
- Run the script, fix divergences, re-run until 0 mismatches.
- Open the unit via Playwright, expand 3 rows (full / partial / zero attendance), screenshot the drawer, and confirm the three file exports match totals.

## Technical changes anticipated
- Tighten `mergeByCanonicalName` regex so it catches every variant (`HRA 5%`, `ESIC 3.25 %`, `LWW-4`, `Conveyance (10%)`) and is applied to ALL four item lists in one place in the route.
- Patches in `src/lib/payroll-calc.ts` around (a) component-base matching after canonicalization for EPF/ESI/Bonus bases, (b) cap-flat overrides, (c) fixed-vs-prorated classification.
- Header-builders in `src/routes/admin.payroll.$unitId.tsx` use the canonical name as the column header so no `5%` / `15%` headers can appear.
- Same column-collapse logic applied to `src/routes/admin.invoice.$unitId.tsx`.
- No DB schema changes.

## One thing I need from you to anchor the audit
Pick ONE employee in the current FPL unit whose numbers still look wrong, and paste:
- Employee code + designation
- The wrong value and which column
- What the correct value should be and how it's derived

If you'd rather I just run the verification harness and report what diverges, say "skip — just run the audit" and I'll proceed without it.

## Out of scope
- Changes to contract authoring UI (cost components manager, allowance manager).
- New report types.
