I’ll fix ESI end-to-end with these changes:

1. **Cost Component Manager**
   - Keep ESI configured as percentage: `0.75%` employee and `3.25%` employer.
   - Keep the base as: `Earned Gross`.
   - Make the label/description clearly payroll attendance-based, not a fixed monthly amount.

2. **Client Contracts > Add/Edit Resource**
   - When adding `ESI Employee Contribution (Net)` or employer ESI, do **not** calculate/show a fixed amount like `₹145` or `₹146` from monthly gross.
   - Store ESI resource amount as `0` / attendance-based placeholder, because earned gross is unknown until attendance is computed.
   - The salary breakdown preview will show ESI as attendance-based instead of a fixed rupee amount.

3. **Payroll Compute Wages**
   - Ensure payroll ignores the saved contract ESI amount completely.
   - Calculate employee ESI at payroll time only as:
     `ceil(0.75% × Earned Gross Salary)`
   - Calculate employer ESI similarly:
     `ceil(3.25% × same base)`
   - This will reflect correctly in the row dropdown, totals, payroll export, and invoice/billing views.

4. **Existing Kids Clinic contract data**
   - Clean/neutralize the old saved ESI amounts inside existing contract resources so the contract screen no longer shows stale `145.04` / `628.52` as if they are fixed values.
   - For Kids Clinic example, with full May attendance currently showing `T Days = 31.88`, gross `₹19,339`, actual-days base `31`:
     - Earned Gross = `19,339 / 31 × 31.88 = ₹19,888.49`
     - ESI base = earned gross
     - Employee ESI = `ceil(Earned Gross × 0.75%)`
     - Employer ESI = `ceil(Earned Gross × 3.25%)`

5. **Verification**
   - Verify in the database for Kids Clinic and Santosh Vishnu Hajare.
   - Verify through the payroll calculation path that the dropdown shows earned ESI, not the old contract value.
   - Check that exports use the same computed amount.