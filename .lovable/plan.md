# End-to-End Flow Test: FPL Unit (Attendance → Payroll → Invoice)

I'll run the full workflow myself against the live database and browser, then report calculation correctness vs. industry standard.

## Scope

Pick one FPL unit with an active contract and 2–5 deployed employees. Use the previous calendar month (e.g. June 2026) as the attendance period so payroll windows are already closed.

## Steps

1. **Discover data** (read-only)
   - Find FPL customer → pick one unit with active `client_contracts` + deployed `candidates`.
   - Confirm attendance/payroll windows, day-basis, and cost components on that contract.
   - Identify test users: one `field_officer` scoped to the unit, one `hr`, one `leadership`/admin (for payroll/invoice edit).

2. **Field Officer: submit attendance** (via Playwright, logged in as FO)
   - Open `/admin/attendance/{unitId}` for the chosen month.
   - Fill random-but-realistic entries (P/WO/PH mix, a couple of leaves and OT) for each deployed employee.
   - Submit for approval. Verify `attendance_sheets.status = 'submitted'` and HR notification created.

3. **HR: review + edit + approve** (logged in as HR)
   - Open the same sheet, tweak 1–2 entries, upload a proof image, approve.
   - Verify status flips to `approved`, approver + timestamp recorded, payroll/invoice unlock.

4. **Payroll generation** (as HR / payroll-permitted user)
   - Open `/admin/payroll/{unitId}` for the month, trigger generate.
   - Inspect one employee's payslip: verify Basic, DA, HRA, other allowances, gross, PF (12% of PF-wages capped at ₹15k), ESI (0.75% employee / 3.25% employer if gross ≤ ₹21k), PT slab, LWF, net pay, and payable-days math (`gross / day_basis × payable_days`).
   - Cross-check against the formulas in `allowance_types` / `cost_components` (hydrated via `contract-hydrate.ts` + `formula-engine.ts`) and against industry norms.

5. **Invoice generation**
   - Open `/admin/invoice/{unitId}`, generate.
   - Verify billing lines match `contract_resources` cost side, GST split (CGST+SGST vs IGST based on customer state vs branch state), rounding, and totals.

6. **Report**
   - Table of each step: pass/fail, actual vs expected numbers, any UI or math bug found.
   - List of concrete fixes needed (if any) — I will NOT apply them in this plan; I'll surface them for your approval.

## Technical notes

- Uses `psql` + `supabase--read_query` for discovery and verification.
- Uses Playwright (headless Chromium) with the managed Supabase session env vars to drive real UI flows per role. Screenshots saved under `/tmp/browser/fpl-flow/`.
- No schema changes. If a bug requires a data fix (e.g. missing role permission like last time), I'll list it and wait for approval before running any `UPDATE`.
- Auth: I'll need to switch sessions between FO / HR / admin. If session injection only covers the currently signed-in preview user, I'll fall back to invoking the same server functions directly with each role's bearer via `psql`-backed checks and note which UI steps I couldn't drive in-browser.

## Deliverable

A single feedback report with:
- Flow pass/fail per stage
- Sample employee payroll math breakdown (expected vs actual)
- Sample invoice math breakdown (expected vs actual)
- Bug list with proposed fixes (not yet applied)
