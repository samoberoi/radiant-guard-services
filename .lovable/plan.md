# Plan — Organisation → Unit → Client Contract cleanup

Goal: make the 3 modules flow cleanly. Organisation captures only the org profile, the unit owns its contract dates and GST, and the client contract auto-fills from the chosen unit.

## 1. Organisation Manager (`admin.customers.customer-manager.tsx`)

- Remove **Contract start date** and **Contract end date** fields from the create/edit form, the table column, and the CSV export.
- Remove the entire **GSTINs** section (the multi-row `customer_gst_numbers` editor and its save logic).
- Keep the columns `contract_start_date`, `contract_end_date` in `customers` and the `customer_gst_numbers` table in the DB for now (no data loss); just stop reading/writing them from the UI.
- Update `useCustomers` (`src/lib/admin-data.ts`) so the form no longer requires those fields; default them to `null` on save.

## 2. Unit Manager (`admin.customers.unit-manager.tsx`)

Restructure the "Add / Edit Unit" dialog so org → branch → unit identity flows top-down:

1. **Organisation** (required, first field). Dropdown of active organisations.
2. **Branch** — list filtered to branches belonging to the chosen organisation; disabled until org is selected.
3. **Unit code** — auto-generated via `nextUnitCode` once org+branch chosen, but still editable.
4. **Unit name**, **Unit location**, **Status**, **Description**.

When an organisation is picked, auto-sync read-only-style defaults into the billing/contact fields (billing name, address, city, state, country, PAN) from the customer row, but allow the user to override.

**Additional information section**
- Remove **Onboarding date** and **Closing date**.
- Add **Contract start date** and **Contract end date** in their place.

**Business information section**
- Keep **PAN number**.
- Replace single GST input with:
  - `GST payable?` — Yes / No toggle.
  - If **No** → no further GST inputs; clear `gst_type` and `gst_number`.
  - If **Yes** → show `GST type` dropdown with: `Regular`, `Composition`, `SEZ Unit`, `SEZ Developer`, `Casual Taxable Person`, `Non-Resident Taxable Person`, then the **GST number** input (15-char validation as today). Note in helper text: "Auto-detection from GSTIN coming later."

DB migration on `units`:
- Add `contract_start_date date`, `contract_end_date date`, `gst_payable boolean default false`, `gst_type text`.
- Keep `onboarding_date`, `closing_date`, `gst_number` columns (no drop) — UI just stops surfacing onboarding/closing.

Update `Unit` type, `rowToUnit`, and the insert/update payload in `admin-data.ts` accordingly. CSV export gets the new contract date columns and gst type / payable flag instead of onboarding/closing/gst.

## 3. Client Contracts (`admin.contracts.client-contracts.tsx`)

When a **Unit** is selected in the contract form:
- Auto-fill **Unit name** (already done).
- Auto-fill **Contract start date** and **Contract end date** from `units.contract_start_date / contract_end_date` (the new unit-level dates). User can still edit if needed.
- Only those two date fields are shown in the contract dates area (drop the separate "expiry" UI from the form if it duplicates end date — keep the column in DB).

No schema changes here; just read the new unit columns and prefill `start_date` / `end_date` when the unit selection changes (and the user hasn't already edited).

## Technical notes

- One DB migration adds the 4 new columns on `units` with safe defaults. No table drops, no policy changes.
- After migration runs, regenerate Supabase types, then update:
  - `src/lib/admin-data.ts` — `Unit` type, `rowToUnit`, `unitToRow`, CSV mappings.
  - `src/routes/admin.customers.customer-manager.tsx` — remove form fields, table column, GSTIN section, save logic.
  - `src/routes/admin.customers.unit-manager.tsx` — restructure dialog, reorder fields, add org→branch cascade, swap dates, new GST UX, sync defaults from org.
  - `src/routes/admin.contracts.client-contracts.tsx` — on unit-change effect, prefill `start_date` / `end_date` from the fetched unit row.
- `logActivity` calls remain on every create/update/delete (per Core memory).
- No business logic outside these three modules is touched.

## Out of scope (explicitly deferred)

- Live GSTIN portal verification — UI is structured so this can plug in later by populating `gst_type` automatically from the entered GSTIN.
- Dropping deprecated columns (`onboarding_date`, `closing_date`, `customer_gst_numbers`, customer-level contract dates) — leave for a later cleanup migration once stakeholders confirm.
