## Goal

Add a Prospects vs Clients workflow to the Client Contracts page, mirroring the Employees module pattern. Prospect contracts go through the same approval + signature flow already built; on sign, they "promote" to Client and a contract code is issued.

## Lifecycle

```
Prospect (draft)
   └─ submit → Prospect (pending_approval)
        ├─ reject → Prospect (rejected)
        └─ approve + sign → Client (signed/active)  ← contract_code generated here
                                  └─ end_date<today → Client (expired)
```

Key rule: a contract is a **Prospect** until it is signed. Once signed it becomes a **Client** and gets a permanent `contract_code`. Rejected stays under Prospects. Expired stays under Clients.

## Data model

Add to `client_contracts`:
- `record_type text not null default 'prospect'` — `'prospect' | 'client'`
- `prospect_code text` — assigned on insert (e.g. `PROS-0001`), kept for audit even after promotion
- `promoted_at timestamptz` — when it became a client
- `contract_code` — already exists; **leave null on insert**, populate only on approval+sign

Backfill: existing rows with `approval_status='approved'` or non-empty `contract_code` → `record_type='client'`; everything else → `'prospect'`. Generate `prospect_code` for all existing prospects.

Sequences:
- `prospect_code_seq` for `PROS-0001…`
- Existing contract code generator stays; only fires on promotion.

## UI

`admin.contracts.client-contracts.tsx`:
- Top-level `Tabs`: **Clients** (default) | **Prospects**, with counts.
- Page subtitle / "New Contract" button always creates a `prospect`.
- Prospects tab columns: Prospect Code, Unit, Service Type, Created, Approval Status, Actions (Approve / Reject / Edit / Delete).
- Clients tab columns: Contract Code, Unit, Service Type, Start/End, Status (Active/Expired), Actions (View / Download signed PDF / Delete).
- Stat cards split per tab.

`ContractApprovalDialog`:
- On Approve+Sign, in addition to existing updates, set `record_type='client'`, `promoted_at=now()`, generate `contract_code`, notify creator: *"Prospect PROS-0007 approved and promoted to client CON-0012."*
- Reject: stays in Prospects tab with reason.

## Notifications

Reuse existing `notifications` table + `NotificationBell`. New event types:
- `contract_submitted` (creator → admins, future) — for now skipped, single-admin.
- `contract_approved` — already wired; message updated to mention promotion.
- `contract_rejected` — already wired.

## Out of scope

- RBAC split between submitter and approver (still single admin user).
- Editing a signed/client contract (locked, same as today).
- Converting a Client back to Prospect.

## Files touched

- New migration: add `record_type`, `prospect_code`, `promoted_at`, `prospect_code_seq`, backfill.
- `src/routes/admin.contracts.client-contracts.tsx` — add Tabs, split lists, default insert as prospect, no `contract_code` on create.
- `src/components/ContractApprovalDialog.tsx` — on approve+sign, promote + generate contract code.
- `src/lib/notifications.ts` — minor message tweak (optional).
