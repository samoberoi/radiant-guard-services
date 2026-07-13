## Goal

Make the Employee Onboarding flow production-tight and role-correct:

- **Field Officer (FO)** onboards candidates, restricted to the units in their scope.
- **HR, Leadership, Super Admin** can also onboard directly (same wizard), *and* are the only roles that see/handle approvals.
- Submissions notify HR + Leadership + Super Admin (not "all admins" indiscriminately).
- Reject requires a written reason → notifies the FO who submitted it.
- FO can fix a rejected candidate and re-submit → status returns to `pending`, approvers are re-notified.
- On approve → employee code assigned, FO is notified.
- Verify end-to-end with a scripted browser run.

## Current State (audit)

- Table: `candidates` uses `status ∈ draft | pending | rejected | approved | active | inactive` with `rejection_reason`.
- `admin.employees.tsx` already: FO sees only own submissions; submit sets status `pending`; approve/reject mutations exist; a reject-reason dialog exists; `notifyAdmins()` fans out on submit/approve/reject.
- Gaps to fix:
  1. `notifyAdmins` uses `get_admin_user_ids` (super-admin phones + role `admin/super_admin`) — **misses HR & Leadership**.
  2. Approve/Reject buttons on pending rows are shown to any viewer of the Candidates tab — should be gated to HR / Leadership / Super Admin / Admin.
  3. FO unit picker in the wizard shows all units — should be filtered to the FO's scoped units (branch/unit assignments in `employee_scope_assignments`).
  4. Reject dialog does not enforce a non-empty reason.
  5. FO doesn't get a notification on approve/reject of their own submission.
  6. Re-submit path: editing a `rejected` candidate should clear `rejection_reason` and move back to `pending` + re-notify approvers (today it goes to `pending` but `rejection_reason` isn't cleared and the approver notification isn't guaranteed on the edit path).

## Changes

### 1. Notifications — new helper `notifyOnboardingApprovers`

Add in `src/lib/notifications.ts`:
- New RPC-backed helper that returns auth user IDs whose `candidates.role_key ∈ ('hr','leadership','super_admin','admin')` and are `status='active'`, plus the hard-coded super-admin phones (reuse pattern from `get_admin_user_ids`).
- Wrapper `notifyOnboardingApprovers({title, message, link, entityId})` that inserts one notification per recipient (dedupe by uid, skip actor).
- Wrapper `notifyUser(userId, {...})` for one-off notifications back to the FO.

If the SQL function doesn't exist, add it via migration:

```text
get_onboarding_approver_user_ids() → TABLE(user_id uuid)
  SECURITY DEFINER, SET search_path=public
  Returns admins + candidates.role_key in ('hr','leadership','super_admin','admin')
```

### 2. `admin.employees.tsx` — permissions & routing of notifications

- Add `const canApproveOnboarding = isSuperAdmin || ['hr','leadership','admin','super_admin'].includes(roleKey ?? '');`
- Gate the two icon buttons on the candidate row (Approve/Reject) and the wizard's Approve/Reject buttons behind `canApproveOnboarding`. Non-approvers still see the row & wizard read-only view but no action buttons.
- Replace `notifyAdmins(...)` calls on submit/approve/reject with `notifyOnboardingApprovers(...)`.
- On **approve**: also call `notifyUser(candidate.created_by)` with an "Approved — Employee Code EMP-xxx assigned" message (link to `/admin/employees`).
- On **reject**: also `notifyUser(candidate.created_by)` with the rejection reason and a link back to their candidate.

### 3. FO onboarding — unit scoping

- In the wizard's Unit picker, filter `units` to those whose `id` is in FO's scope, OR whose `branch_id` matches an FO branch-scope entry. Use existing `useScopeAssignments()` + `units` join already loaded on the page.
- If FO has no scope assignments, show a clear empty state: "You have no units assigned. Ask your admin to assign a branch/unit before onboarding."
- Guardrail on submit: reject the insert client-side if the selected unit isn't in scope (defence in depth; RLS still authoritative).

### 4. Re-submit after rejection

- In `persist(...)` when the editing candidate's status was `rejected` and it's being re-submitted, set `status='pending'`, `rejection_reason=''`, `rejected_at=null`, and always call `notifyOnboardingApprovers({title: "Candidate re-submitted after fixes", ...})`.
- FO-side badge on their row: keep showing the previous rejection reason until the record moves back to `pending`.

### 5. Reject dialog — mandatory reason

- Disable the "Reject" confirm button until `rejectReason.trim().length >= 5`.
- Show inline helper "Explain what needs to be corrected so the field officer can fix it."

### 6. HR / Leadership onboarding path

Confirm (no code change needed if already true) that the "Add candidate" button in the Candidates tab is visible to these roles too — today it's gated by `isFieldOfficer` in one place; ensure the button is shown to `canApproveOnboarding` as well. Their submissions still land in `pending` (they can then approve their own if they choose, but a small polish: pre-select their unit-less flow and let HR pick any unit).

## End-to-End Verification (Playwright, sandbox)

Script `/tmp/browser/onboarding/run.py` that uses `LOVABLE_BROWSER_SUPABASE_*` to swap sessions for three seeded users (FO, HR, Super Admin — reuse existing accounts if present, otherwise create via a one-off SQL insert into `candidates` + auth users if needed and note it in the report).

Steps captured with screenshots:

1. Login as **FO** → open `/admin/employees` → Candidate tab → Add candidate with random valid data → Submit for approval → screenshot the "Pending" row.
2. Login as **HR** → notification bell shows unread → click → opens candidate → click Reject → try empty reason (button disabled) → enter "Aadhaar image blurred, re-upload" → Reject → screenshot.
3. Login as **FO** → notification bell shows "Candidate rejected: <reason>" → open the rejected row → edit → change the flagged fields → Submit → screenshot pending again.
4. Login as **Super Admin** → notification of re-submission → open → Approve → screenshot the row now `active` with `EMP-xxx` code.
5. Login as **FO** → notification "Candidate approved (EMP-xxx)" → screenshot.

Report includes: pass/fail per step, screenshot filenames, and any console/network errors caught during the run.

## Out of scope

- No changes to payroll/invoice modules.
- No new offboarding logic.
- No changes to `candidates` table columns beyond what's already present (`rejection_reason`, `rejected_at`, `created_by`, `approved_at`, `employee_code`).

## Technical notes

- Files touched: `src/lib/notifications.ts`, `src/routes/admin.employees.tsx`, one Supabase migration (only if the approver RPC is missing).
- No RLS changes required — approvers already have update rights on `candidates` via existing policies; the migration only adds a `SECURITY DEFINER` helper for recipient lookup.
- Uses existing `logActivity` calls; adds an `action: 'resubmit'` event on the re-submit path.
