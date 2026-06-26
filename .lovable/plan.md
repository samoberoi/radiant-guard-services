# Office Assets Module

A new top-level module mirroring the inventory module patterns (branch scoping, value/count rollups, beautiful PageHeader + KPI strips, activity logging). Scope is **non-billable resources only** (finance, HR, IT, etc.) — not security guards.

## Scope

1. **Office Asset Inventory** — master catalog of asset types (Laptop, Chair, Mouse, Keyboard, Charger, Cable, Monitor, Desk, Light…) with category, brand/model, unit cost, depreciation life, and per-branch on-hand counts.
2. **Allocations** — assign individual asset units (with serial/tag) to a non-billable resource at a branch; auto-reflect on the resource's profile.
3. **Branch Rollup** — every branch shows count and value of office assets held + allocated.
4. **Resource Profile Integration** — non-billable employee profile gets an "Office Assets" tab listing everything allocated to them.
5. **Seed data** — one demo non-billable unit ("Radiant HQ – Non-Billable"), one finance-analyst resource with rate card, 2-3 assets allocated.

## Data model

```text
office_asset_categories         category taxonomy (IT, Furniture, Electrical…)
office_assets                   catalog: name, category, brand, model, unit_cost,
                                depreciation_months, image_url, enabled
office_asset_units              individual physical units: asset_id, tag/serial,
                                branch_id, status (in_stock|allocated|scrap|repair),
                                purchase_date, current_value
office_asset_allocations        unit_id, candidate_id, branch_id, allocated_at,
                                returned_at, condition_out, condition_in, notes
```

All four tables: RLS on, GRANT to authenticated + service_role, branch-scoped read for branch admins, full access for super_admin / inventory_manager / a new `office_assets_manager` role concept handled via existing RBAC (`office_assets` module key).

Activity logged on every create/update/allocate/return/scrap via `logActivity` with module label "Office Assets".

## UI surface (under `/admin/office-assets/*`)

- `admin.office-assets.tsx` — layout + dashboard hub
  - KPIs: Total Asset Value, Total Units, Allocated %, Top 5 Branches by Value
  - Branch holdings table (count / value / utilization)
- `admin.office-assets.inventory.tsx` — catalog CRUD (asset types) + per-branch stock view, search, CSV export, value/count toggle
- `admin.office-assets.allocations.tsx` — allocate / return dialog; dropdown of non-billable resources auto-fills branch + designation; list view with filters
- `admin.office-assets.categories.tsx` — small category manager

Reused components: `PageHeader`, `MiniStat`, shadcn Table/Dialog/Select, `confirmAction`, `downloadCsv`, `logActivity`.

Left nav: new "Office Assets" section in `src/routes/admin.tsx` with sub-items Dashboard, Inventory, Allocations, Categories. Visible to super_admin, admin, and any role granted the `office_assets` module via RBAC.

## Profile integration

On the candidate details page (`admin.candidates.$id.details.tsx`), add an "Office Assets" card for non-billable resources only — list allocated units with tag, allocated date, condition, and a "Return" action.

## RBAC

Add `office_assets` module to `src/lib/rbac-modules.ts` with sub-modules: Dashboard, Inventory, Allocations, Categories.

## Seed

Single migration also seeds:
- Category "IT Equipment", "Furniture"
- Assets: Dell Latitude Laptop (₹85k), Logitech Mouse (₹800), Ergonomic Chair (₹12k)
- One unit "Radiant HQ – Non-Billable" (non-billable flag on `units` if available, else a marker on the branch)
- One candidate "Aarti Mehta" — Finance Analyst, non-billable, mapped to that unit
- 3 office_asset_units allocated to her (laptop, mouse, chair)

## Non-billable detection

Existing `units` table has billing flags; we'll treat resources whose unit/designation is flagged non-billable as eligible. If no clean flag exists, add a `non_billable boolean default false` column to `candidates` in the same migration and set it true for the seed + expose a toggle on the candidate form (out of scope to retrofit existing data; only seeded resource will be non-billable initially).

## Out of scope (this pass)

- Depreciation schedule auto-calc beyond storing months
- QR code generation for tags
- Mobile scan-in/scan-out
- Procurement workflow (separate from existing PO inventory)
