## Goal
Augment the Inventory hub (`/admin/inventory`) with a comprehensive, fully clickable KPI overview so users can see, at a glance, totals across the whole inventory chain and click any tile to drill into the underlying module.

## Where it goes
- Edit `src/routes/admin.inventory.dashboard.tsx` — `InventoryOwnerDashboard` is already rendered inside `src/routes/admin.inventory.tsx`. New KPI grid is inserted at the very top of that component (above the existing range/category filter strip and current KPI tiles), so the procurement workflow rail and the new overview live on the same page.

## New KPI tiles (all clickable → respective module page)

Money + stock (top row, larger tiles):
1. Total Stock Value — `stockValue` (already computed) → `/admin/inventory/stock`
2. Total Stock Qty — sum of `inv_stock_balances.qty` where qty>0 → `/admin/inventory/stock`
3. Procurement Spend (range) — `spendCur` (already computed) → `/admin/inventory/purchase-orders`
4. Recovery Collected (range) — sum of `inv_write_offs.recovery_amount` in range → `/admin/inventory/write-offs`

Master counts (compact grid):
5. Products — `inv_items` total → `/admin/inventory/items`
6. Vendors — `inv_vendors` total → `/admin/inventory/vendors`
7. Warehouses — `inv_warehouses` total → `/admin/inventory/warehouses`
8. Branches — `branches` total → `/admin/inventory/stock` (or `/admin/customers/branch-manager` if accessible per RBAC; fallback to stock)

Workflow counts with sub-splits (each tile shows main number + 2 small status chips, the whole tile is one link):
9. Purchase Orders — total + `Open` (`draft|approved|partial`) vs `Closed` (`received|closed`) → `/admin/inventory/purchase-orders`
10. Delivery Challans (GRNs) — total + `Received` vs `Posted` (derived from `inv_goods_receipts.status`) → `/admin/inventory/goods-receipts`
11. Internal Transfers — total + `In Transit` vs `Acknowledged` (from `inv_transfers.status`) → `/admin/inventory/transfers`
12. Issuances — total + `Issued` vs `Acknowledged` (from `inv_issuances.status`) → `/admin/inventory/issuances`
13. Write-offs — total + `Pending` vs `Approved` → `/admin/inventory/write-offs`
14. Adjustments — total + `Draft` vs `Posted` (from `inv_adjustments.status`) → `/admin/inventory/adjustments`

All tiles respect the existing `range`, `warehouseFilter`, `categoryFilter` where the value is range-sensitive (PO spend, GRN counts, write-off recovery). Master counts are global.

## Data additions
Add three new `useQuery`s (the rest already exist):
- `inv_transfers` → `id,status,transfer_date`
- `inv_issuances` → `id,status,issue_date`
- `inv_adjustments` → `id,status,adjustment_date`

Reuse: `itemsQ`, `vendorsQ`, `whsQ`, `branchesQ`, `poQ`, `grnQ`, `woQ`, `balancesQ`.

## Component
New `InventoryKpiGrid` rendered at the top of `InventoryOwnerDashboard`:
- Section heading "Overview".
- Row 1: 4 hero tiles (`grid-cols-2 lg:grid-cols-4`) with `IndianRupee`, `Boxes`, `ShoppingCart`, `Wallet` icons.
- Row 2: 4 small master-count tiles (`grid-cols-2 lg:grid-cols-4`).
- Row 3: 6 workflow tiles (`grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`), each `<Link>`-wrapped with a primary number, the module name, and two small `Badge`s showing the status split.

Styling follows existing dashboard tile conventions (`rounded-2xl border border-border bg-card p-4`, `font-display`, `tabular-nums`, hover `border-accent/40 hover:bg-accent/5`).

## RBAC
Each tile is wrapped in `can(<module-key>) ? <Link>… : null` using the existing `can()` helper already used in the dashboard, so an inventory-restricted role still sees a coherent grid (mirrors the existing dashboard-tile gating pattern).

## Out of scope
- No DB migrations.
- No changes to other roles' dashboards.
- No new charts — keeps existing spend-over-time, category split, holdings, low-stock and activity sections intact.
