Plan to fix ESI Net end-to-end:

1. **Lock the ESI Net formula globally**
   - Use the payroll-computed earned values, not contract/fixed gross.
   - Formula for employee ESI Net:
     ```text
     ESI Base = Earned Gross − Earned Washing Allowance − Earned Conveyance Allowance
     ESI Employee Net = ceil(ESI Base × 0.75%)
     ```
   - If Washing Allowance is missing, treat it as `0`.
   - If Conveyance Allowance is missing, treat it as `0`.
   - Employer ESI will use the same base with `3.25%`.

2. **Fix the source of the ₹146 issue**
   - The wrong ₹146 is coming from using a lower earned gross/base path instead of the payroll row’s displayed earned gross of `₹19,895`.
   - I will make the payroll detail row use the same `r.wages.earnedGross` value that is displayed in the payroll run summary, then subtract earned washing/conveyance from the earned component rows.
   - For Santosh, if earned gross is `₹19,895` and washing/conveyance are not present:
     ```text
     ESI Base = 19,895 − 0 − 0 = 19,895
     ESI = ceil(19,895 × 0.0075)
         = ceil(149.2125)
         = ₹150
     Total Deduction = EPF + ESI + PT + any other deductions
     ```

3. **Update every affected screen/export**
   - Payroll Runs detail dropdown: ESI row will show `—` in the contract column and `₹150` in earned amount for Santosh.
   - Payroll totals: total deductions will include the corrected ESI value.
   - Invoice/billing view: use the same shared ESI calculation.
   - Client Contracts and Cost Component Manager: show the formula as attendance/payroll-based, not a fixed contract amount.
   - CSV/export paths will continue to use the shared payroll calculation.

4. **Clean existing setup data**
   - Ensure Cost Component Manager ESI rows store the base as:
     ```text
     Earned Gross − Washing Allowance − Conveyance Allowance
     ```
   - Ensure existing contract resource ESI rows do not store stale fixed values and keep the corrected base metadata.

5. **Verify before reporting back**
   - Re-run a calculation for Kids Clinic / Santosh Vishnu Hajare using the same active payroll period shown in Payroll Runs.
   - Confirm the output shows:
     - Earned Gross: `₹19,895` from payroll row
     - Washing: `₹0` if missing
     - Conveyance: `₹0` if missing
     - Employee ESI Net: `₹150`
     - Total deductions include `₹150`, not `₹146` or `₹148`.