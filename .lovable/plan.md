## Goal

Add an approval + signature + notification workflow to client contracts, mirroring the candidate→employee approval pattern, plus a project-wide notification system (bell icon + Notification Center).

## Contract status model

New lifecycle (replaces current "active by default"):

```text
draft → pending_approval → approved → signed (= effectively "active")
                       ↘ rejected
any signed contract whose end_date < today → expired (auto)
```

- Default on create: `pending_approval` (never auto-active).
- "Inactive" in the UI = anything not yet `signed` and not `expired` (covers `pending_approval`, `approved-awaiting-signature`, `rejected`).
- `expired` is set only by the existing auto-expiry pass when `end_date` is in the past.

DB changes (single migration):
- Add columns to `client_contracts`: `approval_status` (`pending`|`approved`|`rejected`, default `pending`), `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejection_reason`, `signed_at`, `company_signature_data`, `signed_pdf_url`.
- Backfill existing rows: anything currently `active` → `approval_status='approved'`, `signed_at=now()` so they stay usable.
- Loosen the `status` enum/check to allow `pending_approval` alongside existing values.

## Contract page UI changes (`admin.contracts.client-contracts.tsx`)

Per-contract row + detail header:
- Top of each contract shows an **Approval pill**: `Pending` (amber), `Approved` (blue), `Rejected` (red), `Signed` (green), `Expired` (muted).
- For admins on a `pending` contract: show **Approve** and **Reject** buttons (same visual pattern as candidate→employee).
  - **Approve** → opens existing signature dialog (reuse `SignDocumentDialog` pattern / `SignaturePad`) where the admin signs. On save: stores signature, sets `approval_status='approved'`, `signed_at=now()`, `status='active'`, and emits a notification to the contract creator.
  - **Reject** → opens a small dialog asking for a `rejection_reason` (required, ≥10 chars). On save: sets `approval_status='rejected'`, `status='inactive'`, stores reason, emits a notification to the contract creator.
- Dashboard counters at the top of the list update to: Pending / Approved / Signed / Rejected / Expired (replacing the current active/inactive/expired split). Cards turn amber when Pending > 0 and red when Rejected > 0, matching the employee dashboard convention.

Create/edit form:
- Remove the manual `status` selector. New contracts are always created as `status='inactive'`, `approval_status='pending'`.
- Editing a contract that has already been signed does NOT reset approval; editing one that is `pending` keeps it pending.

All mutations call `logActivity` with module `"Client Contracts"`.

## Notification system (new)

DB (same migration):
- `notifications` table: `id`, `user_id` (recipient), `actor_id`, `type` (`contract_approved`|`contract_rejected`|generic), `title`, `message`, `link` (route to open), `entity_type`, `entity_id`, `read_at`, `created_at`.
- RLS: a user can read/update their own rows; inserts allowed for authenticated users (since approvals come from admin server fn).

Server fn (`src/lib/notifications.functions.ts`):
- `listMyNotifications`, `markNotificationRead`, `markAllRead`, `createNotification` (used internally by contract approve/reject).

UI:
- **Bell icon** in the global top header (in `__root.tsx` or the admin shell header). Shows unread count; click opens a popover with the latest 10 + "View all" link to `/admin/notifications`.
- **Sidebar entry** "Notification Center" with bell icon → `/admin/notifications` route, showing the full list with filters (All / Unread) and per-row "Mark read" / open-link.
- Polls via `useQuery` with a 30s `refetchInterval` (Realtime can be added later; keeping scope tight).

Since we currently have a single admin user, both the "creator" and "approver" will be the same person in practice — notifications still fire so the flow is verifiable end-to-end.

## Files to touch / add

- `supabase/migrations/...` — new migration (schema only; data backfill via insert tool after).
- `src/routes/admin.contracts.client-contracts.tsx` — status model, approve/reject buttons, dashboard, remove status select.
- `src/components/ContractApprovalDialog.tsx` — new: signature-on-approve + reject-with-reason.
- `src/lib/notifications.functions.ts` — new server fns.
- `src/components/NotificationBell.tsx` — new: header popover.
- `src/routes/admin.notifications.tsx` — new: Notification Center page.
- `src/components/app-sidebar` (or wherever sidebar items live) — add "Notification Center" entry.
- `src/routes/__root.tsx` or admin shell — mount `<NotificationBell />` in top bar.

## Out of scope (call out)

- Real RBAC (role-based gating). For now every authenticated user is treated as admin, matching current project behavior. Approve/Reject buttons will be guarded by a single `isAdmin` flag we can later wire to real roles.
- Realtime push for notifications (polling is sufficient for now).
- Editing/versioning of an already-signed contract (would re-trigger approval — flagged for a later pass).
