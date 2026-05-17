## Goal

Wire HyperRevamp employees together: a Field Manager role that can be mapped to State / Customer / Branch / Unit (any combination), Guards that report to a Field Manager **and** can be mapped to one or more Units. Show this both ways: in the Employees list (filters + tree by manager) and on the Unit page (tree of Field Manager → Guards deployed there).

Nothing about role privileges is hard-coded — the **roles** table stays as data; we just seed two named rows so the linkage works.

---

## 1. Data model (one migration)

New columns on `candidates`:
- `is_enabled boolean not null default true` — drives the enable/disable toggle (separate from `status`, which is the approval lifecycle).
- `reports_to uuid` (self-reference to another candidate; soft, no FK) — guard → field manager.

New table `employee_scope_assignments` (the multi-scope mapping):
- `id uuid pk`
- `candidate_id uuid not null`
- `scope_type text not null check in ('state','customer','branch','unit')`
- `scope_id text not null` — UUID of the target row, or state name for `state` (since `candidates.permanent_state` is text and `states.id` is uuid; we store as text for both)
- `scope_label text` — denormalized display string ("Karnataka", "ACME / Bangalore HQ", etc.) for cheap UI rendering
- `created_at`, `updated_at`
- unique `(candidate_id, scope_type, scope_id)`
- RLS: authenticated read/write/update/delete (matches existing pattern)

Seed data (via insert tool, not migration):
- Ensure `roles` has `field_manager` ("Field Manager", sort_order between admin & guard) and `guard` ("Guard"). Both are data rows — permissions are still defined separately in RBAC.
- Insert one new employee: full_name "Field Manager 1", `role_key='field_manager'`, status `approved` (gets EMP-003 via existing trigger), `is_enabled=true`.
- Update the two existing guards (EMP-001, EMP-002): `role_key='guard'`, `reports_to=<new FM id>`.
- Seed `employee_scope_assignments` for the FM covering both guards' current units (so the tree resolves immediately).

---

## 2. Employees page (`admin.employees.tsx`)

### Filter bar (above the table)
- Search box (existing).
- Filters: **Role**, **Designation**, **Organization (customer)**, **Unit**. Each is a `Select` with an "All" option.
- **Reports to** filter (Field Manager) when role filter = `guard` or "all" — small, optional.
- **Gear icon** popover (configure filters): checkboxes to show/hide each filter; choice persists to `localStorage` (`employees.filterPrefs`). Default = all visible.

### Per-row additions
- **Enable/Disable switch** in a new "Active" column. Toggling opens the existing `confirmAction` dialog ("Disable employee EMP-003?"). Writes `is_enabled` and calls `logActivity` (action `enable`/`disable`, module `Employees`).
- Disabled rows render at 60% opacity with a muted "Disabled" badge.

### Reporting linkage UI
- For employees with role `guard`: a small "Reports to" cell with a Select of all `field_manager` candidates (with confirm + log). Empty state shows "—".
- For employees with role `field_manager`: a "Scope" cell with a chip list of their `employee_scope_assignments` and a "+ Add scope" trigger that opens a small dialog (scope type + searchable target picker). Add/remove are confirm-gated and logged.

### Manager tree view (toggle above table)
- A second "Tree" view-mode button next to the table. Renders a collapsible: each Field Manager → their guards. Guards not under any FM appear under an "Unassigned" group.

---

## 3. Unit page (`admin.customers.unit-manager.tsx`)

When the user opens / edits a unit, add a new **"Deployment"** section below the existing form sections (and in the read-only detail strip on the row hover, a compact summary).

For the current unit:
- **Resolve effective Field Manager(s):** any FM whose assignments contain `unit:<id>`, `branch:<unit.branchId>`, `customer:<unit.customerId>`, or `state:<unit.billingState>`. De-duplicated.
- Render a **tree**: each FM (avatar, name, EMP code, scope-source badge like "via Customer") → list of guards that (a) `reports_to` that FM **and** (b) either `unit_id = this unit` or have a `unit` assignment for this unit.
- Below the tree, a flat list view of all guards deployed to the unit with their FM column. Both views are always rendered side-by-side on desktop (tree left, list right), stacked on mobile — user asked for both.
- Read-only here; editing is done from the Employees page (link "Manage assignments →").

A small shared helper in `src/lib/deployment.ts` exposes:
- `resolveFieldManagersForUnit(unit, assignments, candidates)` → `Array<{ fm, sources: ScopeType[] }>`
- `resolveGuardsForUnit(unit, candidates, assignments)` → `Array<Candidate>`
- `buildFmGuardTree(fms, guards)` → grouped structure

Same helpers power the Employees tree, the Unit page, and any future Branch/Customer pages.

---

## 4. Confirmation & logging (consistent with existing modules)

Every new mutation (toggle enable, change reports_to, add/remove scope, seed-time inserts done via Insert tool) is gated by `confirmAction` and writes a `logActivity` entry with module `Employees` and a clear `entityLabel` (employee code / name).

---

## 5. Out of scope (for this turn)

- Branch-page and Customer-page tree views (helpers will be ready; we can drop the same component in later).
- Multi-FM-per-guard (current model: one FM per guard, which matches your phrasing).
- Permission/RBAC changes for the new roles — roles are seeded as data only.

---

## Files

**Migration**
- `supabase/migrations/<ts>_employee_scope_and_reports_to.sql`

**Data seed (Insert tool, after migration approval)**
- Upsert `roles` rows, insert FM employee, update two guards, insert FM scope assignments.

**New**
- `src/lib/deployment.ts` — shared resolvers.

**Edited**
- `src/routes/admin.employees.tsx` — filters bar + gear, enable/disable column, role-aware extra column (reports_to / scope chips), tree view toggle, new mutations.
- `src/routes/admin.customers.unit-manager.tsx` — Deployment section (tree + list) inside the unit dialog.
- `src/integrations/supabase/types.ts` — regenerated automatically after migration.

Approve this and I'll run the migration + seed, then build the UI.