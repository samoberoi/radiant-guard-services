## Attendance approval → Payroll/Invoice handoff, plus clickable notifications

### 1. Clickable notifications (bell + live feed)
Already 90% there — both `NotificationBell` and `LiveFeed` already navigate to `n.link` on click, and `transitionSheet` already writes a `link` like `/admin/attendance/{unitId}?month=…&year=…` into every attendance notification.

Fixes:
- Ensure every notification we emit in the flow includes a `link` (approver notif on submit, submitter notif on approve/reject, and the new payroll/invoice notif — see step 3).
- Verify the URL search-param format matches what the attendance route expects (`month` is 0-based today; the attendance page reads it — will double-check while implementing and normalize both sides to 1-based month if needed, so the notification opens the correct sheet).
- Mark notification as read on click (already done in bell; add same in `LiveFeed`).

### 2. Attendance submit button + richer approver message
In `src/routes/admin.attendance.$unitId.tsx`:
- Rename the draft/rejected action button `Submit for Payroll` → `Submit for Approval` (also update the icon tooltip/aria if any).
- In the `transitionSheet` "submitted" branch, look up the current field officer's `full_name` from `candidates` (via `current_user_candidate_id` / mobile) and the unit name (already fetched as `unit`), then send an approver notification like:
  - Title: `Attendance approval needed — {Unit Name}`
  - Message: `{FO full name} submitted attendance for {Unit Name} ({period}). Tap to review.`
  - Link: existing attendance URL.
- Keep the existing `notifyApprovers({ moduleKey: "attendance" })` fan-out so HR + Leadership + Admin all receive it.

### 3. New "Send for Payroll & Invoice" button after approval
Currently after approval the only action is `Reopen`. Add a new primary action visible when `status === "approved"` and the user has `payroll.edit` (or `attendance.approve`) permission:

- Button label: `Send for Payroll & Invoice` (icon: `Send`).
- On click:
  1. Upsert a `payroll_runs` row for `(unit_id, period_start, period_end)` with `status = 'submitted'`, `submitted_by = auth.uid()`, `submitted_at = now()` (mirrors existing `transitionRun` shape in `admin.payroll.$unitId.tsx`). This is the "handoff" — payroll/invoice pages read from `attendance_sheets` + `payroll_runs` and already unlock once attendance is approved; setting `payroll_runs.status = 'submitted'` marks it as officially sent.
  2. Add a boolean `attendance_sheets.sent_to_payroll` (migration, default false) so the button state is durable across refresh — OR derive it purely from `payroll_runs.status IN ('submitted','approved')` and skip the migration. Will use the derived approach to avoid schema churn.
  3. Fire two notifications with links to the payroll and invoice pages:
     - `notifyApprovers({ moduleKey: "payroll", … link: /admin/payroll/{unitId}?… })`
     - `notifyApprovers({ moduleKey: "invoice", … link: /admin/invoice/{unitId}?… })`
     Message includes unit name + period + who sent it.
  4. Log activity ("send_to_payroll" on the attendance sheet).
- After success, the button flips to `Reopen` (which calls the existing `transitionSheet.mutate({ status: 'draft' })` AND resets `payroll_runs.status` back to `draft` so the "sent" state clears).
- If the sheet is reopened, all downstream payroll/invoice pages naturally lock again (existing behaviour).

Button visibility matrix (status = approved):
```text
                       sent? = false   sent? = true
approver / admin       [Send…] [Reopen]  [Reopen]
non-approver           —                 —
```

### 4. Files to change
- `src/routes/admin.attendance.$unitId.tsx` — rename button, enrich approver notif, add "Send for Payroll & Invoice" action + reopen wiring, query `payroll_runs.status` to know if already sent.
- `src/components/LiveFeed.tsx` — mark-as-read on click (parity with `NotificationBell`).
- `src/lib/notifications.ts` — no schema changes; reuse `notifyApprovers` / `notifyUser`.
- No DB migration required (state derived from existing `payroll_runs` row).

### 5. End-to-end test matrix I'll run (Playwright, with FO 1111111111/111111, HR, and admin sessions where possible)
1. **FO submit**: log in as FO → open FPL Pune April 2026 → click `Submit for Approval` → confirm bell+live-feed on HR account show the new notification with FO name, and clicking it lands on the exact sheet.
2. **HR reject with reason**: reject → confirm FO gets clickable rejection notif and lands on the sheet in `rejected` state.
3. **FO re-submit → HR approve**: confirm approval notif to FO, and that the new `Send for Payroll & Invoice` button appears for HR/admin.
4. **Send for Payroll & Invoice**: click → confirm `payroll_runs` row created with `status=submitted`, two notifications fanned out (payroll + invoice module approvers), and the button becomes `Reopen`.
5. **Payroll approver clicks payroll notif** → lands on `/admin/payroll/{unitId}`; invoice approver clicks invoice notif → lands on `/admin/invoice/{unitId}`.
6. **Reopen**: click `Reopen` → attendance goes back to `draft`, `payroll_runs.status` back to `draft`, downstream pages re-lock, sent-state indicator cleared.
7. **Permission edge cases**: non-approver FO does NOT see Send/Reopen; guard role sees nothing on this page.

Deliverable at the end: short pass/fail table + screenshots for each of the 7 scenarios.