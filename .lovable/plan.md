I found the FPL unit (`FPL Technologies — Pune`) and its real approved attendance period (`2026-05-01` to `2026-05-31`) with 55 active employees and 1,705 attendance entries. I also reviewed the payroll export code for Wage Register, Pay Sheet, and MIS.

Plan:

1. Create one shared payroll export builder inside the payroll page
   - Generate Wage Register, Pay Sheet, and MIS from the exact same computed row data used by the visible payroll table.
   - Avoid separate/duplicated export logic that can drift from on-screen totals.

2. Fix column generation end-to-end
   - Remove blank export columns.
   - Remove zero-only columns unless they are required statutory/summary columns.
   - Merge duplicate statutory columns like EE EPFC, EE PT, EE ESIC, ER EPFC, ER ESIC into one clean column each.
   - Keep only necessary payroll columns for Wage Register, Pay Sheet, and MIS.

3. Fix calculation parity
   - Ensure exported `T Days`, `OT Hours`, `OT Duties`, gross, earned component totals, deductions, net pay, employer contributions, and CTC exactly match the payroll page.
   - Stop rounding individual columns inconsistently where it causes totals to mismatch.
   - Add reconciliation checks before export so calculated totals equal row totals.

4. Improve export visibility/readability
   - Wage Register and MIS Excel files: auto-fit widths, freeze header, keep identifier columns as text, make numeric columns readable.
   - Pay Sheet PDF: use only the necessary columns so everything remains visible and not crushed.
   - Add totals row at the bottom of Wage Register, Pay Sheet, and MIS for real verification.

5. Verify with FPL real data
   - Use the FPL May 2026 attendance/payroll data to compare exported rows against the payroll screen totals.
   - Check sample employees plus grand totals across all three exports.
   - Verify there are no duplicate headers, no blank headers, and no unwanted zero-only columns.

Technical notes:
- Main file to update: `src/routes/admin.payroll.$unitId.tsx`.
- Export writer file may need a small update in `src/lib/csv-export.ts` for better totals/format support if required.
- No database schema change is needed.