
## Goal

Lock every list/report page to the logged-in user's place in the hierarchy, exactly like the Inventory → Stock page now does:

```text
super_admin           → sees everything (no lock)
inventory_manager     → sees everything inside Inventory (no lock for inventory)
branch_manager        → locked to their branch: sees branch + units in branch
                        + field officers mapped to that branch + guards under them
field_officer         → locked to themselves: sees own stock/records
                        + guards reporting to them (reports_to)
guard / security_guard→ locked to themselves only
```

The lock is visual (no branch/FO dropdown — replaced by a read-only chip) AND enforced at the database level (RLS).

## Centralise the rule once

Create one shared hook `useScopeFilter()` in `src/lib/use-scope-filter.ts` that returns:

- `role` (super_admin | inventory_manager | branch_manager | field_officer | guard | none)
- `branchId` / `branchLabel` (for branch_manager)
- `candidateId` / `candidateLabel` (for field_officer / guard)
- `assignedGuardIds: Set<string>` (for field_officer — their guards via `reports_to`)
- helpers: `filterByBranch(row)`, `filterByCandidate(row)`, `filterByUnit(row, unitToBranchMap)`

Every page imports this hook instead of re-implementing the logic.

## Pages to lock (frontend)

For each, replace branch/holder dropdowns with a locked chip when the user is scoped, and filter the visible rows:

| Module | Route | Lock by |
|---|---|---|
| Employees | `admin.employees` (in `admin-data.ts`) + candidate list views | branch (via `employee_scope_assignments`) |
| Units | `admin.customers.unit-manager` | branch |
| Branches | `admin.customers.branch-manager` | branch (only their own) |
| Attendance index | `admin.attendance.index` | branch → units in branch |
| Attendance unit | `admin.attendance.$unitId` | block if unit not in branch |
| Payroll index | `admin.payroll.index` | branch |
| Invoice index | `admin.invoice.index` | branch |
| Vehicles | `admin.vehicles` | branch (via assigned unit) |
| Assets | `admin.assets.inventory` | branch |
| Inventory: demands, issuances, transfers, GR, dashboard | already partly locked — make them all use `useScopeFilter` consistently and add FO/guard handling |
| Field dashboard | `admin.field-dashboard` | candidate-self for field_officer |
| My inventory | `admin.my-inventory` | candidate-self always |

Branch managers will not see other branches' units, employees, attendance, payroll, vehicles, assets or inventory. Field officers will only see their own records plus their guards'. Guards will only see themselves.

## Backend (RLS) — enforce the same rule

One migration that updates SELECT policies on these tables to follow the hierarchy via the existing helpers (`is_admin_user`, `current_user_branch_scope_ids`, `current_user_candidate_id`, `current_user_assigned_guard_ids`, `is_candidate_in_current_user_branch`):

- `candidates` — branch_manager sees candidates whose branch ∈ their branch; field_officer sees self + guards reporting to them; guard sees self.
- `units` — branch_manager sees units in their branch; lower roles see only units they are assigned to.
- `branches` — branch_manager sees only their branch; lower roles same.
- `attendance_sheets` / `attendance_entries` — by unit's branch.
- `payroll_runs` — by unit's branch.
- `client_contracts` / `contract_resources` — by unit's branch.
- `vehicles` / `vehicle_*` — by assigned unit's branch.
- `assets` / `property_*` — by branch.
- `inv_demands`, `inv_issuances`, `inv_transfers`, `inv_goods_receipts`, `inv_stock_movements` — same hierarchy as `inv_stock_balances`.
- Write policies tightened the same way (branch_manager cannot create records for another branch; field_officer cannot act on records that aren't theirs or their guards').

`super_admin` and `inventory_manager` (for inventory tables only) bypass via `is_admin_user()` / role check.

## Out of scope for this pass

- Master-data admin screens (cost components, allowance types, language manager, etc.) — these stay super-admin/admin only and don't change.
- RBAC module access toggles — unchanged; this plan only narrows what each role sees within modules they're already allowed into.

## Confirmation

When complete I will reply with a checklist of every file and every RLS policy that was updated, so you can verify the lock end-to-end.

---

This is a large change touching ~15 routes and ~12 RLS policies in one migration. Approve and I'll ship it in one pass.
