# Attendance approval workflow + Payroll section

## 1. Attendance approval workflow

Add a status lifecycle per (unit, payroll period) attendance sheet:
`draft → submitted → approved | rejected`. While in `draft` or `rejected`, users can edit cells; once `submitted`, cells lock; once `approved`, the sheet is read-only and unlocks Payroll for that unit/period.

**DB change** — new table `attendance_sheets`:
- unit_id (uuid)
- period_start, period_end (date)
- status (text: draft/submitted/approved/rejected)
- submitted_at/by, approved_at/by, rejected_at/by, rejection_reason
- unique(unit_id, period_start, period_end)
- standard RLS (authenticated full access, matching other tables)

**UI in `admin.attendance.$unitId.tsx`**:
- Header status pill (Draft / Submitted / Approved / Rejected).
- Action buttons (right side of header):
  - Draft/Rejected → `Submit for Approval`
  - Submitted → `Approve` (green) + `Reject` (red, opens reason dialog)
  - Approved → `Reopen` (admin only, optional)
- When status ≠ draft/rejected, all attendance/OT cells become read-only.
- Log every transition via `logActivity` (module: "Attendance").

## 2. New Payroll section

**Sidebar**: add `Payroll` link below `Attendance` in `src/routes/admin.tsx` (Wallet icon), route `/admin/payroll`.

**Routes**:
- `src/routes/admin.payroll.tsx` — `<Outlet />`
- `src/routes/admin.payroll.index.tsx` — filter UI (organization, payroll cycle/window, period) → grid of approved units (same look as attendance index, but only units whose `attendance_sheets.status = 'approved'` for the selected period).
- `src/routes/admin.payroll.$unitId.tsx` — wage computation table for that unit's deployed people.

**Computation page** (per unit / per period):
For each candidate mapped to the unit (via `candidate_units`) whose attendance row exists:
1. Pull attendance entries → derive P Days, PH Days, OT hours, OT Days, Other Paid Leaves, T Days (same formulas already in attendance page; extract into `src/lib/payroll-calc.ts`).
2. Pull contract resource for the candidate's designation from `contract_resources` (gross, components, deductions, benefits, employer contributions, payroll_day_base).
3. Compute:
   - Per-day rate = gross / payroll_day_base (fixed_days or month days)
   - Earned gross = per-day rate × T Days
   - Allocate earned gross across components proportionally to contract components
   - Apply statutory deductions (PF, ESIC via esic_branch, PT via state slabs, LWF) using existing `pt-lookup` / `lwf-lookup` helpers
   - Net pay = earned gross − employee deductions
   - Employer cost = earned gross + employer contributions
4. Display in a table: Name | Designation | T Days | OT Hrs | Gross Earned | Components breakdown (expandable) | Deductions | Net Pay | Employer Cost.
5. Totals row at bottom + CSV export.

This page is read-only — it just reflects what attendance + contract config define.

## 3. Files touched

- New: `supabase/migrations/<ts>_attendance_sheets.sql`
- New: `src/lib/payroll-calc.ts` (shared computation)
- New: `src/routes/admin.payroll.tsx`, `admin.payroll.index.tsx`, `admin.payroll.$unitId.tsx`
- Edited: `src/routes/admin.attendance.$unitId.tsx` (status bar + submit/approve/reject + lock cells)
- Edited: `src/routes/admin.tsx` (sidebar Payroll link)

## 4. Notes / scope

- "Approved" gate is per (unit, period). If the user later changes a payroll period in Payroll filters, only units approved for that exact period appear.
- Rejection requires a reason; it's surfaced back to the attendance page.
- This delivers the end-to-end skeleton — formulas use the components/deductions already on each `contract_resources` row. If you want different statutory rules later (PF cap, ESIC cutoff, bonus, etc.), we tune `payroll-calc.ts` without touching UI.
