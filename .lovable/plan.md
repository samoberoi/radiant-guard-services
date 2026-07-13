
## Audit Summary (Control Center → Contract → Attendance → Payroll → Invoice)

Good news first: **most Control Center masters DO propagate live** — attendance codes, PT slabs (via pincode), payroll-day-base method/weekdays, and allowance/cost-component **formulas** are re-read on every payroll/invoice run (via `hydrateFormulasFromMaster` + `resolvePtAmount`). The engine handles ESI ceiling, day-basis methods, and formula-driven allowances correctly.

But there are **real calculation gaps** that cause payroll ≠ invoice, and several master-manager screens that look wired but silently don't affect the numbers.

### Findings by severity (evidence: file:line)

**Critical**
1. **Half-day (HD) pays a full day.** `computeAttendanceTotals` (`src/lib/payroll-calc.ts:85`) only checks `counts_as_present`/`is_paid`; no fractional `day_value` on `attendance_codes`. Every HD silently overpays.
2. **LWF Manager is dead.** `src/lib/lwf-lookup.ts:46` `resolveLwf()` is implemented but never called from payroll/invoice. LWF on paysheet = whatever flat number is frozen on the contract row. Editing LWF Manager has zero effect.
3. **Billing Type (Man Hours/Days/Months/Special) has no effect on invoice.** Zero references in `payroll-calc.ts` / `admin.invoice.$unitId.tsx`. Two contracts differing only in billing type produce identical invoices.
4. **Invoice never reads employee additions/deductions.** `admin.invoice.$unitId.tsx` doesn't query the `additions`/`deductions` tables at all — payroll does (`admin.payroll.$unitId.tsx:322`). Any ad-hoc entry causes invoice ≠ payroll for the same employee/period.
5. **Invoice's `computeWages` call omits `dayBases`/`periodDates`/`phOverrideAmount`** (`admin.invoice.$unitId.tsx:341` vs payroll `:557`). Contracts using `custom_weekdays` or `actual_minus_weekly_off` get a **different base-day denominator on the invoice than on the payroll** — invoice falls back to `periodDayCount − 4` approximation (`payroll-calc.ts:568`).

**High**
6. **EPF has no statutory scaffolding.** No ₹15,000 wage-ceiling constant, no 8.33% EPS split (₹1,250 cap), no 0.5% EDLI/admin. Everything relies on whatever `percentage`/`cap_amount` the admin typed on the contract's EPF cost-component row. Contrast with ESI which does have `ESI_EARNED_GROSS_CEILING = 21000` (`payroll-calc.ts:212`).
7. **ESIC Branch Manager is not consumed** by the engine — `esic_branch_id` never referenced in calc; ₹25,000 disability ceiling not implemented.
8. **Bonus (₹7,000 cap) and Gratuity (4.81%) have no dedicated engine support** — only generic cost-component rows.
9. **Duplicated baseDays logic**: top-level switch (`payroll-calc.ts:561-589`) vs `resolveDayBaseCount` (`:621-646`) — can drift. `actual_minus_weekly_off` in the top-level branch is a hardcoded `periodDays - 4` fallback whenever `periodDates` isn't passed (i.e. always on invoice).
10. **Non-formula percentage/cap changes in Control Center DON'T propagate.** `hydrateFormulasFromMaster` (`src/lib/contract-hydrate.ts:99`) overlays only formula fields — a % or cap change on a legacy Cost Component row requires contract re-save. No "master out of sync" indicator despite `formula_version` being plumbed everywhere.
11. **OT divisor hardcoded to 26** (`payroll-calc.ts:746`) regardless of Payroll Day Base method — inconsistent with regular pay divisor.

**Medium**
12. `netPay` has no `Math.max(0, ...)` floor — silently negative if a large ad-hoc deduction is entered (`payroll-calc.ts:905`).
13. `baseDays ≤ 0` silently falls back to 26; broken `pdb:<uuid>` divisor references silently fall back — masks misconfiguration.
14. `UNIT_DUTY_HOURS = 8` hardcoded (`payroll-calc.ts:40`) — Duty Manager not connected.
15. No DOJ/DOL (mid-month joiner/leaver) proration of the denominator.
16. TDS not implemented (acceptable, but flagging).

### Sync-gap matrix (does editing this master affect the next payroll run without re-saving the contract?)

| Master | Auto-syncs? |
|---|---|
| Allowance/Cost-Component **formula** | Yes |
| Allowance/Cost-Component **% / cap (non-formula)** | **No** — frozen on contract |
| Payroll Day Base (method/weekdays/fixed days) | Yes |
| Professional Tax slabs | Yes |
| Attendance codes | Yes |
| **LWF** | **No** — never queried |
| **ESI ceiling / EPF rate / EPF cap** | **No** — code constant / frozen on contract |
| **Billing Type** | **No** — never consumed |
| **ESIC Branch** | **No** — never consumed |
| **Duty hours (Duty Manager)** | **No** — hardcoded constant |

---

## Fix Plan (grouped by phase; each phase is independently deployable)

### Phase 1 — Kill payroll↔invoice divergence (Critical #4, #5)

- **`src/routes/admin.invoice.$unitId.tsx`**
  - Build `periodDates` (same logic as payroll route ~L525) and `dayBases` map from `payroll_day_bases` (same query as payroll ~L441-466). Pass `{ periodDates, dayBases, phOverrideAmount }` into every `computeWages` call at `:341`.
  - Query `additions` and `deductions` tables for the invoice window + candidate list (mirror `admin.payroll.$unitId.tsx:322-420`). Fold them into totals **before** `computeWages` the same way payroll does (day-adjustments vs cash) so employer-cost and billed amount line up 1:1 with the payroll register.
  - Add an on-screen "matches payroll" reconciliation stat.

### Phase 2 — Wire the dead Control Center masters (Critical #2, #3; High #7)

- **LWF**: import `resolveLwf` in payroll + invoice routes; compute LWF per candidate from the unit's state/pincode and the `labour_welfare_funds` master; use it to override the LWF row's `amount`/`employerAmount` in the resource snapshot before `computeWages` (mirror how PT is applied inside `computeWages` at `payroll-calc.ts:383` — either move LWF into the engine the same way, or apply the override in the route). Preferred: add `LWF_LOOKUP` to `computeWages` options like `PT_LOOKUP` and resolve inside `applyLwfToWageComputation` (new fn in `payroll-calc.ts`).
- **Billing Type**: introduce a `billing_type_code` on `billing_types` and branch the invoice compute:
  - `man_days` → current per-day × attended-days.
  - `man_hours` → per-hour × attended-hours (present-days × duty-hours + OT hours).
  - `man_months` → flat monthly rate irrespective of attendance (except LOP).
  - `special` → per-resource custom formula field.
  - Store the resolved amount in the invoice line so the on-screen preview matches.
- **ESIC Branch**: not calc-critical; leave as metadata for now but document it explicitly in the audit doc so it stops looking wired.

### Phase 3 — Half-day + statutory correctness (Critical #1; High #6, #8, #11)

- **Half-day**: add `day_value NUMERIC(3,2) DEFAULT 1.0` to `attendance_codes`; extend Attendance Code Manager UI (`src/routes/admin.attendance-code-manager.tsx`) to edit it (default HD=0.5, WO=0/1 as configured, P=1). Use it in `computeAttendanceTotals` (`payroll-calc.ts:85`) so `pDays += day_value` etc. Migrate existing HD row(s) to 0.5.
- **EPF engine hardening**: add `EPF_WAGE_CEILING = 15000`, `EPS_CAP = 1250`, `EDLI_RATE = 0.005`, `ADMIN_RATE = 0.005` constants + `applyEpfRule` split so a single "EPF" cost-component row produces EPS/EPF/EDLI/Admin sub-lines respecting caps, independent of what the admin typed as `cap_amount`.
- **Bonus/Gratuity**: add `BONUS_CAP = 7000`, `GRATUITY_RATE = 0.0481` constants and dedicated calc branches keyed off cost-component "kind" (`epf`/`esi`/`bonus`/`gratuity`/`lwf`) rather than name-regex matching (currently `\blwf\b` etc. at `payroll-calc.ts:773`).
- **OT divisor**: replace hardcoded 26 with `resolveOtDivisor(payrollDayBase, periodDates)` reusing the unified baseDays function.

### Phase 4 — Consistency, safety, and observability (High #9, #10; Medium #12–15)

- Unify `baseDays` switch (`payroll-calc.ts:561-589`) and `resolveDayBaseCount` (`:621-646`) into one function; call it from both places and from the contract-editor "payable days" preview (`admin.contracts.client-contracts.tsx`) so preview = engine.
- Extend `hydrateFormulasFromMaster` (`src/lib/contract-hydrate.ts:99`) to optionally overlay `percentage` / `cap_amount` / `cap_flat_amount` for **non-formula** lines, gated by a `sync_from_master` boolean per line (default true). Adds a "sync now" affordance in the contract editor when a line is out of sync (compare stored `formula_version` vs master).
- Add hard floors: `netPay = Math.max(0, netPay)` + surface a validation warning in the payroll UI when the raw net would go negative or when `baseDays ≤ 0` triggers the fallback.
- Source `UNIT_DUTY_HOURS` from Duty Manager (per contract's `duty_id`) instead of the hardcoded 8.
- Add DOJ/DOL proration: pass `joiningDate` / `leavingDate` into `computeWages`; when method is `fixed_days`/`custom_weekdays`, shrink the denominator proportionally (industry practice: `denominator × active_days_in_period / period_days`).

### Phase 5 — Test scenarios (regression pack)

Add a `src/lib/__tests__/payroll-calc.spec.ts` covering scenarios 1–12 from the audit (baseline full month, half-day, custom-weekdays payroll↔invoice equality, ESI/EPF cap boundaries, PT via pincode with excluded regions, LWF live master change, ad-hoc addition day-adjust vs cash suppression, invoice reconciles with payroll, negative-net guard, `baseDays=0` fallback, billing-type divergence). This is the deliverable that proves each fix.

---

## Technical Details

- **Files changed (primary)**: `src/lib/payroll-calc.ts`, `src/lib/contract-hydrate.ts`, `src/routes/admin.invoice.$unitId.tsx`, `src/routes/admin.payroll.$unitId.tsx`, `src/routes/admin.attendance-code-manager.tsx`, `src/routes/admin.contracts.client-contracts.tsx`, `src/lib/lwf-lookup.ts` (add engine-shaped export).
- **Migrations**: `attendance_codes.day_value NUMERIC(3,2) DEFAULT 1.0` + backfill (HD=0.5); optional `billing_types.code` text + backfill for the 4 canonical codes; optional `cost_components.kind` enum backfill (`epf|esi|pt|lwf|bonus|gratuity|other`) if we move off regex matching.
- **Non-breaking**: all engine changes preserve existing frozen-amount behavior when new fields are absent (opt-in), so already-approved payrolls don't shift.
- **Out of scope**: TDS, per-day min-wage floors, multi-currency, PF-EPS actuarial splits beyond the standard 8.33%/3.67%.

---

## Recommended order

Phase 1 first — it fixes the most-visible symptom ("payroll and invoice don't match") with the smallest blast radius. Phase 2 next — turns three "wired but dead" master screens into real settings. Phase 3 is the biggest correctness lift (half-day + EPF + Bonus statutory scaffolding). Phase 4 is hardening. Phase 5 locks the fixes in with tests.

Want me to start with **Phase 1 (invoice ↔ payroll parity)** on approval, or bundle Phase 1+2 together?
