## 1. Database (single migration)

- Seed sub-module rows under `employees`:
  - `employees / candidates` — Add Candidate sub-module
  - `employees / approvals` — Candidate Approval sub-module
- Permissions seed (idempotent upsert into `role_permissions`):
  - `field_officer`: `employees` (view), `employees/candidates` (view+edit, no delete/approve). Nothing else.
  - `hr`, `super_admin`, `leadership`: `employees/approvals` view+edit+approve.
- Seed **No Man's Land** unit under Radiant org (existing customer). Idempotent — skip if a unit with code `NOMANS` already exists.
- Provision test field officer:
  - Insert into `candidates`: full_name "Field Officer Demo", mobile `1111111111`, role_key `field_officer`, status `active`, is_enabled true, employee_code auto.
  - Map to a couple of Radiant units via `candidate_units` (incl. No Man's Land) so dashboard has data.
  - Auth user `phone-1111111111@radiantguard.local` will be created by existing OTP flow at first login — same pattern as other test users; no auth.users insert needed.

## 2. Candidate workflow gating

In `src/routes/admin.employees.tsx` (and candidate detail/edit routes):
- **Field officer view**: tabs/filters collapsed to just **Candidates**. They see only candidates **they created** (`created_by = auth.uid()`) with status `pending` or `rejected`. Approved/active rows disappear from their list automatically.
- **Add Candidate** button visible (requires `employees/candidates` edit).
- Rejected rows show rejection reason + "Edit & resubmit" → resets status to `pending`.
- **HR / Leadership / Super Admin**: new **Approvals** tab listing pending candidates with Approve / Reject actions (writes `status`, `approved_by/at` or `rejected_by/at` + reason). Uses `employees/approvals` approve permission.
- All mutations call `logActivity` with label "Employee Approvals" / "Candidate Intake".

## 3. Field Officer Dashboard

New route `src/routes/admin.field-dashboard.tsx` (sidebar entry visible only to field_officer, replacing the main dashboard for them):
- Tiles: Units I cover (count), Guards reporting to me (count of active candidates assigned to my units with role_key=guard), Pending candidates I submitted, Rejected awaiting fix.
- Unit tree section: for each of my units, list unit name + org, expandable to show guards on that unit (name, mobile, designation).
- Quick "Add Candidate" CTA pre-selecting unit.

## 4. Sidebar & routing

- Sidebar (`src/routes/admin.tsx`): Dashboard link routes to `/admin/field-dashboard` for `field_officer`, `/admin/dashboard` for everyone else. Hide modules the role has no `view` on (already the case). Employees stays visible; nested submodules respect new sub-module perms.
- Restrict `/admin/employees` for field officer to the Candidates tab only (other tabs return null when `!can('employees', 'view')` on those sub-modules — to be added later if needed; not in scope now).

## 5. Out of scope this round

- Mobile-app-only UX, push notifications, OTP rate-limit changes.
- Per-candidate document attachments beyond what the existing add-candidate form already supports.
- Re-routing already-approved employees (the No Man's Land unit gives ops a place to park them; a bulk-move tool can come later).

## 6. Deliverable to user

- Test login: mobile **1111111111**, OTP via existing flow. Role: Field Officer.
- Expectation: after login they see the Field Officer dashboard, an Employees tab limited to Candidates, and an Add Candidate button. No other admin modules.
