
# Role-Based Access Control (RBAC)

A new "Role-Based Access Control" screen under **Control Center** where you pick a role and toggle View / Edit / Delete on every module and its sub-modules in one elegant grid. Permissions are persisted in the backend so they can later drive what each role sees and can do.

This first pass delivers the **management UI + storage**. Actual enforcement (hiding nav items / blocking buttons across every existing screen) will be wired in a follow-up — the foundation laid here is what every screen will read from.

## Roles (seeded)

Guard · Field Manager · Finance · Admin · Account Receivable · Account Payable · Sales · Marketing · Leadership · Super Admin

Super Admin is locked — always has full access on everything, cannot be edited.

## Modules & Sub-modules

```text
Organizations (parent)
  ├─ State Manager
  ├─ Branch Manager
  ├─ Organization Manager
  └─ Unit Manager
Contracts
  └─ Client Contracts
Employees
Candidates
Control Center
  ├─ Professional Tax Manager
  ├─ Labour Welfare Fund
  ├─ Duty Manager
  ├─ Service Type Manager
  ├─ Payroll Manager
  ├─ Payroll Days Manager
  ├─ Allowance Manager
  ├─ Billing Type Manager
  ├─ Designation Manager
  ├─ Cost Component Manager
  ├─ Ex-Service Manager
  ├─ Language Manager
  ├─ Company Documents
  └─ System Logs
RBAC (super-admin only)
```

## Grid Behavior

- Role selector chip-row at the top.
- Sticky module rows. Each parent module is collapsible to reveal its sub-modules.
- Three columns: **View · Edit · Delete**.
- Parent-row checkboxes act as "select all" — toggling **View** on the parent grants View to every sub-module; same for Edit/Delete. Tri-state indicator when sub-modules are mixed.
- Edit implies View; Delete implies Edit+View (auto-enforced).
- "Apply to all sub-modules" quick action per row.
- Per-role "Reset" and global "Save changes" with a dirty indicator.
- Activity logged (`logActivity` → "RBAC") on every save.

## Data model

```text
roles
  key (PK)   e.g. 'guard','super_admin'
  name       'Guard'
  sort_order, is_system

role_permissions
  role_key, module_key, sub_module_key (nullable for module-level)
  can_view, can_edit, can_delete
  unique(role_key, module_key, sub_module_key)
```

Module/sub-module keys live in a single source-of-truth file `src/lib/rbac-modules.ts` used by both the editor and the future enforcement helpers.

A `useRolePermissions(roleKey)` hook + `hasPermission(module, sub, action)` util will be exported now so we can wire enforcement screen-by-screen in the next iteration without DB changes.

## Files

- DB migration: `roles`, `role_permissions` tables + RLS, seed 10 roles.
- `src/lib/rbac-modules.ts` — module registry.
- `src/lib/rbac.ts` — load/save permissions, `hasPermission` helper.
- `src/routes/admin.rbac.tsx` — the grid editor.
- `src/routes/admin.control-center.tsx` — add RBAC tile.

Confirm and I'll build it.
