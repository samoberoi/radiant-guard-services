## Goal
Let an admin set **different prices per size** for the same vendor + item, directly from the Rate Cards page. No schema change needed — `inv_vendor_rate_cards` already has `size_value`, and the PO form already looks up rate by `(vendor, item, size)` with a no-size fallback.

## What changes

### 1. Rate Cards dialog — multi-size grid (file: `src/routes/admin.inventory.rate-cards.tsx`)
Replace the current single-row dialog with a **per-size pricing grid**:

- Pick **Vendor** and **Item** (as today).
- On item select, fetch `inv_item_sizes` for that item.
  - If item has sizes → render one editable row per size (size locked, columns: Unit Price, Tax %, MOQ, Lead days, Active).
  - If item has no sizes → render a single row with size = "—".
- Pre-fill each row from existing `inv_vendor_rate_cards` rows for that (vendor, item); empty otherwise.
- "Copy from first row" button to fan out price/tax/MOQ/lead to all sizes in one click.
- **Save** does an upsert per row in a single mutation:
  - existing row → `UPDATE`
  - new row with price > 0 → `INSERT`
  - existing row that user cleared → `DELETE`
- One `logInv` entry per (vendor, item) save summarising count of sizes saved.

### 2. Matrix view — show size spread (same file)
Each cell currently shows the cheapest price across sizes. Keep that, but:
- Tooltip: list all size→price pairs.
- Sub-label under the price when >1 size row exists: `N sizes · ₹min–max`.

### 3. List view — unchanged
Already shows one row per (vendor, item, size). Just keep it.

### 4. Compare view — unchanged
Already groups by `(item, size)` and ranks vendors per size.

### 5. PO form — no changes needed
Already does size-aware lookup with no-size fallback (`admin.inventory.purchase-orders.tsx:244`). It will start picking up the per-size prices automatically.

## Technical notes
- New query in dialog: `supabase.from("inv_item_sizes").select("size_value,sort_order").eq("item_id", itemId).eq("enabled", true).order("sort_order")`.
- Upsert strategy: load existing rows for `(vendor_id, item_id)` on dialog open, diff against form state on save, then issue parallel insert/update/delete via `Promise.all`.
- Keep RLS/permissions as-is — table already has full authenticated CRUD policies.
- Invalidate `["rc"]` query keys after save so matrix/list/compare all refresh.

## Out of scope
- No DB migration.
- No change to PO, GRN, transfer, or issuance flows.
- No bulk import/export changes.
