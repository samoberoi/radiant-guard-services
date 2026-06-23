
# Payroll end-to-end alignment

Goal: every contract — Kids Clinic, FPL, and any future client — flows correctly from Control Center → per-employee calculation → on-screen breakdown → Wage Register / Pay Sheet / MIS export, with finance-grade numbers that match the vendor's wage register.

## 1. Calculation engine (`src/lib/payroll-calc.ts`)

Single source of truth used by the screen and all exports.

### 1a. Day base — default to 26
- When the contract's Payroll Day Base is set, honour it.
- When it is **not** set or the method is `actual_days`, fall back to **26**, not calendar days. (Today we fall back to `periodDayCount`, which is why Kids Clinic with no Payroll Day Base shows wrong per-day rates.)

### 1b. Earnings proration — keep current model
```
componentEarned = contractAmount × (P + otherPaidDays) / baseDays
Paid Holiday    = (contractGross / baseDays) × PH_count   (separate line)
```
This already matches the FPL register row-by-row and stays.

### 1c. Overtime — switch to vendor convention for ALL clients
Replace the current `(Basic+DA) / (baseDays×8) × 2 × OT_hours` with:
```
uniformContract = Σ contract components whose canonical name matches /uniform/i
otBase          = contractGross − uniformContract
OT amount       = otBase / (baseDays × 8) × 1 × OT_hours
```
- Single rate (×1), not statutory double.
- Base = full monthly gross minus Uniform Allowance.
- Same rule for every contract; no per-contract toggle for now.

### 1d. Deductions & employer contributions — already correct, verify
- Percentage rows recompute from their configured `baseComponents` on the **earned** values (existing `benefitAmountFromConfig`).
- Fixed rows like Uniform, LWF stay at contract amount.
- ESI uses statutory 0.75 / 3.25 % on (earned Gross − Washing − Conveyance), ceiling ₹21,000 — unchanged.
- EPF recomputes off whatever the contract row's base + cap says — unchanged.
- PT resolves from Professional Tax Manager by state/region/gender/earnedGross — unchanged.

### 1e. Round trip
`earnedGross = Σ(scaled components) + Paid Holiday + Overtime`, then `netPay`, `totalEmployerContributions`, `employerCost` all derived from that. No hidden values.

## 2. Exports (`src/routes/admin.payroll.$unitId.tsx`)

Keep the current "hide any column whose value is zero across every row" behavior — confirmed in the questions. The fix is making sure non-zero values actually flow through:

### 2a. Column source of truth
- **Contract (F …) columns**: union of every component on every employee's contract for the period. Already correct.
- **Earned (E …) columns**: union of every component on `wages.components`. Today this misses HRA on Kids Clinic only because the engine is producing zero (wrong day base / wrong proration). Fixing §1a fixes the column.
- **Deductions (EE …) / Employer (ER …) columns**: union across all rows, header canonicalised (`EE EPF`, `ER ESIC`, etc.). Already correct.

### 2b. Adapt to the contract
Once §1 lands, Kids Clinic's HRA, EPF/ESIC employee, EPF/ESIC employer, Management Fee, LWF, etc. become non-zero per row and appear automatically in Wage Register and MIS without per-client hard-coding.

### 2c. Totals & CTC
- Totals row sums every numeric column.
- MIS adds: every `ER …` column, `Total Employer Contributions`, `Employer Cost (CTC) = E Gross + Total ER`. Already there; only verifying the underlying numbers are right after §1.

## 3. Verification

For each unit we have data for (Kids Clinic, FPL, and at least one other live unit) for **May 2026**:

1. Fetch contract_resources, attendance_entries, additions, deductions for the period.
2. Run the new engine in a small node script and produce per-employee:
   contract gross, base days, P, PH, OT hrs, earned components, PH amount, OT amount, earned gross, EPF EE, ESIC EE, PT, total ded, net, EPF ER, ESIC ER, Mgmt Fee, total ER, CTC.
3. Spot-check against the vendor sheet (FPL) and against a hand calculation for Kids Clinic (≤5 sample employees). Surface any rows that don't tie to the vendor within ₹1, and report the delta.
4. Only after the script reconciles, ship the code changes.

## 4. What is intentionally **not** changing

- The on-screen Payroll table layout and the per-employee expanded breakdown (only the numbers it shows will change because the engine changed).
- Additions/Deductions admin pages.
- Control Center (Cost Components, Allowance Manager, PT/LWF managers).
- ESI / PT / EPF statutory rules.

## 5. One open input from you

For Kids Clinic verification, please drop the May-2026 wage register (vendor copy or your gold copy) into chat. If you don't have one, I'll reconcile Kids Clinic against a hand calculation of 5 sample employees using their contract + attendance, and treat FPL as the primary regression reference.

---

### Files I'll touch in build mode

- `src/lib/payroll-calc.ts` — day-base fallback, OT formula.
- `src/routes/admin.payroll.$unitId.tsx` — no structural change; verify exports after engine fix.
- A throwaway verification script under `/tmp/` (not committed).

### Risk / rollback

Both changes are localised to `computeWages` and consume the same inputs as today. If the vendor reconciliation reveals a per-client deviation we didn't anticipate, the OT rule and day-base fallback can each be promoted to a contract-level setting without re-architecting anything.
