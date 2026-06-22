## Goal

Add a new **Assets** module in the left nav that mirrors the look and feel of Vehicles. It manages immovable assets (predominantly houses owned by the company), with three sub-modules: Asset Inventory, Loan Manager, Expense Manager. Grant access to Super Admin (implicit), Leadership, and Transport.

## Sub-modules

1. **Asset Inventory** – list/add/edit/delete houses.
2. **Loan Manager** – ongoing loan(s) per asset (lender, sanctioned amount, outstanding, EMI, tenure, start/end, interest rate, account no.).
3. **Expense Manager** – recurring/one-off expenses against an asset (maintenance, society, property tax, repair, utilities, etc.) with amount, date, payment mode, vendor, notes, receipt upload.

*No Service Manager, no FastTag, no PUC* (per request).

## Asset fields (House)

- House Number / Name
- Owner (Company entity)
- Address (line 1, line 2)
- City, State, Pincode
- Size / Configuration (1BHK / 2BHK / 3BHK / 4BHK / Other) + Carpet Area (sq.ft, optional)
- Purchase Date, Purchase Value
- Current Estimated Value (optional)
- Property Tax ID (optional)
- Notes
- Enabled (soft-disable like vehicles)

## Database (migration)

Three new public tables, each with the standard four-step shape (CREATE → GRANT → ENABLE RLS → CREATE POLICY) and an `updated_at` trigger.

- `assets` – columns above plus id/created_at/updated_at/enabled.
- `asset_loans` – `asset_id` FK, lender_name, account_no, sanctioned_amount, outstanding_amount, emi_amount, interest_rate, tenure_months, start_date, end_date, status (active/closed), notes, enabled.
- `asset_expenses` – `asset_id` FK, expense_date, category (Maintenance/Society/Property Tax/Repair/Utilities/Insurance/Other), amount, payment_mode (Cash/UPI/Bank/Card/Other), vendor_name, notes, receipt_url, enabled.

RLS: `SELECT/INSERT/UPDATE/DELETE` granted to `authenticated` (mirrors existing `vehicles` table). Policies allow any signed-in user; app-level RBAC governs visibility (same model as vehicles).

## Routes (mirror vehicle look & feel)

- `src/routes/admin.assets.tsx` – layout + dashboard (KPIs: Total Assets, Loans Active, Loan Outstanding ₹, Expense MTD ₹, Loan Closing ≤60d).
- `src/routes/admin.assets.inventory.tsx` – list, add, edit, delete (modelled on `admin.vehicles.inventory.tsx`).
- `src/routes/admin.assets.loans.tsx` – Loan Manager table (modelled on `admin.vehicles.insurances.tsx`).
- `src/routes/admin.assets.expense-manager.tsx` – modelled on `admin.vehicles.expense-manager.tsx`, scoped to assets.

## Left sidebar (`src/routes/admin.tsx`)

Add `assetsChildren` and a new group between Vehicles and Control Center:

- Asset Inventory · Loan Manager · Expense Manager

Plus `pathToModule` entry `{ prefix: "/admin/assets", module: "assets" }` and include `assets` in the `order` / `pathFor` redirect map.

## RBAC registry (`src/lib/rbac-modules.ts`)

Add module `assets` with sub-modules `asset_inventory`, `loan_manager`, `expense_manager`. Icon: `Home`.

## Role permissions (data insert)

For module_key `assets` × each sub-module, insert full-access rows for `leadership` and `transport` (`can_view/edit/delete = true`, `can_approve = false`). Super Admin is implicitly all-access.

## Index redirect (`src/routes/index.tsx`)

Add `assets` to `ORDER` and `PATH_FOR` so users with only Assets access land on `/admin/assets/inventory`.

---

I will create the migration first (you approve), then write the routes, sidebar, RBAC, and seed permissions in one batch.
