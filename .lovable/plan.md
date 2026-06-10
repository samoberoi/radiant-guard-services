## 1. Payroll list — status column & gated actions
File: `src/routes/admin.payroll.index.tsx`
- Add a **Status** column (Approved / Pending approval / Computing / Draft / Rejected — colored badges, same style as Attendance).
- Replace "Compute wages" button logic:
  - status `approved` + has `payroll.approve` → **Reopen payroll** (amber, reverts run to `draft` and logs activity).
  - status `approved` + no approve perm → **Process payroll** link (read-only view of the run).
  - status `processed`/`paid` → **View payroll**.
  - any other / no run yet → **Compute wages** (current behavior).
- Wire a `reopenPayroll` mutation (updates `payroll_runs.status='draft'`, clears approval fields, `logActivity('Payroll','reopen')`).

## 2. Invoice list — status column
File: `src/routes/admin.invoice.index.tsx`
- Add a **Status** column reading the latest invoice for the unit/month (Generated / Sent / Paid / Draft / None).
- Keep current "Show invoice" / "Generate invoice" action exactly as-is (template integration is a later task — no logic change beyond surfacing status).

## 3. New Dashboard (`/admin/dashboard`)
New files:
- `src/routes/admin.dashboard.tsx` — page route.
- `src/lib/dashboard.functions.ts` — server fn aggregating all counts for the selected month.
- `src/components/dashboard/` — `LivingTile`, `MetricTile`, `PnLTile`, `StatusStrip`, `RenewalsTile`.

Sidebar (`src/routes/admin.tsx`): add **Dashboard** as the first item (above Organizations), icon `LayoutDashboard`, links to `/admin/dashboard`. Existing `/admin` landing stays untouched.

Tiles (each clickable, deep-links to its module, only renders if user has `view` permission on that module key):
- Organizations count → `/admin/customers`
- Units count → `/admin/customers/unit-manager`
- Contracts: active count + **upcoming expiry/renewal** (next 60 days) → `/admin/contracts/client-contracts`
- Employees count (active) → `/admin/employees`
- Vehicles: total + month-to-date expense → `/admin/vehicles/inventory` and `/admin/vehicles/expense-manager`
- Inventory: SKUs + low-stock count → `/admin/inventory/stock`
- Attendance: sheets approved / pending for current month → `/admin/attendance`
- Payroll: runs approved / pending / draft for current month → `/admin/payroll`
- Invoice: generated / pending for current month → `/admin/invoice`
- **P&L tile (full-width):** per-unit table for selected month — Unit · Organization · Contracted invoice (sum of `client_contracts` monthly value for unit's active contract) · Payroll cost (sum of computed `payroll_runs.total_employer_cost` for the month) · Variance (₹ + %, green positive / red negative) · row click → opens unit Payroll page. Requires both `payroll.view` and `invoice.view`.

Visual direction: dark glass cards with subtle gradient borders matching existing Payroll header aesthetic (the screenshot the user attached), large display numbers, mini sparkline / status bar at the bottom of each tile, hover lift + cursor-pointer (`LivingTile` shared wrapper using framer-motion already in project).

Permission gating: use `useCurrentPermissions().can(moduleKey, 'view')` to render each tile. Tiles user can't access are simply omitted (no greyed-out placeholders). Super admin sees everything.

Month selector at top (same prev/next + month/year dropdowns pattern as Payroll index) drives all month-scoped tiles + P&L.

## 4. Technical notes
- No DB migration required — all data already exists (`payroll_runs.status`, `payroll_runs.total_employer_cost`, `client_contracts` value fields, `attendance_sheets.status`, invoice tables).
- One server fn `getDashboardSnapshot({ month, year })` returns a typed DTO with all counts + per-unit P&L rows, executed via `supabaseAdmin` for speed (aggregations only — no PII beyond names already visible elsewhere). Gated on the client by permissions; the server returns everything and the UI hides what the user can't view (acceptable since this admin app is fully internal and counts aren't sensitive vs RLS rows).
- Reuse `MiniStat`, `fmtINR`, existing badge palette; add `LivingTile` for the consistent card chrome.

## Out of scope (this round)
- Invoice template integration (user said "soon").
- Historical trend sparkline data — tiles will show current-month figures; sparkline shape will animate but use last-6-month real counts only if cheap to compute (otherwise omitted on first pass).