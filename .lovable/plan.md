## Plan

1. **Update Employer EPF calculation**
   - In the shared payroll calculation engine, change Employer EPF so it follows your rule:
     - If **earned gross salary is ₹15,000 or more** → use the contract/backend Employer EPF amount directly, e.g. ₹1,950.
     - If **earned gross salary is below ₹15,000** → calculate Employer EPF as the contract employer EPF rate, typically **13% × (earned gross − earned HRA)**.
   - Keep Employee EPF unchanged at statutory **12%** with the ₹15,000 ceiling.

2. **Apply the fix everywhere payroll data is shown/exported**
   - Because MIS, Wage Register, Pay Sheet, payroll table, dashboard/profile payroll previews, and invoice payroll calculations all use the shared `computeWages` engine, updating that engine will flow through end to end.
   - Confirm no separate MIS-only EPF formula overrides this value.

3. **Review Employer ESI at the same time**
   - Keep the existing ESI rule unless there is a mismatch:
     - Eligible only when earned gross is up to ₹21,000.
     - Employer ESI = **ceil(3.25% × (earned gross − washing − conveyance))**.
     - Employee ESI = **ceil(0.75% × the same base)**.
   - Verify MIS uses the shared computed employer ESI value, not a stale contract value.

4. **Add/adjust calculation comments for future clarity**
   - Update inline comments so the EPF behavior is explicit: Employer EPF cap is triggered by **earned gross ≥ ₹15,000**, while below that it uses the contract employer EPF percentage on **earned gross − earned HRA**.

5. **Validate with Kids Clinic May data path**
   - Check the payroll/MIS export path after the change.
   - Spot-check employees where earned gross is above ₹15,000 to confirm Employer EPF shows the contract amount such as ₹1,950.
   - Spot-check employees below ₹15,000 to confirm Employer EPF is calculated proportionally using the employer EPF rate.