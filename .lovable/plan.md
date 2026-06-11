Goal: every table in the portal matches the Dashboard P&L table — no horizontal scroll, consistent typography, solid (non-transparent) filter chrome, clean alignment at 1280–1920px.

## 1. Shared primitive: `src/components/DataTable.tsx` (new)

A single table shell every page consumes. Mirrors the dashboard P&L card exactly.

- Card: `rounded-3xl border border-border/70 bg-card shadow-[dashboard-shadow] overflow-hidden` — NO horizontal scroll wrapper.
- Header strip: title + count chip + description + right slot (toolbar).
- Table: `ios-table w-full table-fixed`, header row `text-[11px] uppercase tracking-[0.18em] text-muted-foreground`, body `text-sm`, row hover `bg-accent/[0.04]`, dividers `border-border/50`, numeric cells `tabular-nums text-right`.
- Column API: `{ key, header, cell, align, width?, hideBelow?: "sm"|"md"|"lg"|"xl"|"2xl", priority: 1|2|3 }`.
  - `hideBelow` emits `hidden md:table-cell` etc. on both `<th>` and `<td>` so secondary columns drop out responsively instead of scrolling.
  - Priority-3 columns collapse into an expandable "More" row (chevron on first cell) so nothing is lost on smaller widths.
- Slots: `toolbar` (search + filters, right-aligned), `totals` (right-aligned key/value strip), `empty`, `loading`.

## 2. Shared primitive: `src/components/ui/SolidSelect.tsx` + `SolidSearch.tsx`

Replace the current translucent filter chrome.

- Input/Select: `bg-card border border-border/70 shadow-sm hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/15 rounded-xl h-10 text-sm`.
- Solid white popovers (`bg-popover` not `bg-popover/80`), 8px shadow, no backdrop blur.
- Applied globally by swapping the existing `Select`/`Input` usage above every table.

## 3. Column audit — `hideBelow` rules per page

Always visible: identity column, status, primary action, primary numeric. Hide rules below:

| Page | hideBelow="md" | hideBelow="lg" | hideBelow="xl" | Collapse into More |
|---|---|---|---|---|
| Employees | EMP ID | Mobile | Designation | Role, secondary actions |
| Attendance index | Org code | Location | Active count | Security guard chips |
| Org/Branch/Unit/State managers | Secondary code | Address line 2 | Phone | Contract start, website |
| Client Contracts | Contract code | Period | Created by | Notes |
| Payroll/Invoice index | Org code | Period chip | Sub-total | Created at |
| Inventory POs | PO# secondary | Deliver-to | Total products | Total qty (kept), date |
| Stock report | Size | Unit | Reorder@ | Holder secondary |
| Vendor rate cards | — (matrix table keeps its grid, but caps visible suppliers at 6 with horizontal pagination chevrons inside the card, NOT page scroll) |
| Vehicle inventory / FastTag / Insurance / PUC / Service / Expense | Vehicle ID | Owner | Brand (when Make shown) | Fuel, Type |

Result: no page horizontally scrolls between 1280–1920px.

## 4. Pages touched

All list/table routes are rewritten on `DataTable`:

- `admin.employees`, `admin.attendance.index`, `admin.payroll.index`, `admin.invoice.index`
- `admin.contracts.client-contracts`
- `admin.customers.{state,branch,customer,unit}-manager`
- `admin.inventory.{items,vendors,warehouses,purchase-orders,issuances,transfers,write-offs,adjustments,stock,rate-cards}` + `delivery-challans` if present
- `admin.vehicles.{inventory,fastags,insurances,pucs,service-manager,expense-manager,insight-lab}`
- `admin.notifications`, `admin.system-logs`, `admin.rbac`
- All 18 manager pages under `admin.control-center`: designation, allowance, duty, lwf, professional-tax, esic-branch, asset, language, ex-service, billing-type, service-type, attendance-code, payroll-days, payroll, cost-component, offboarding-reason, addition-type, deduction-type

Attendance calendar (`admin.attendance.$unitId`) is the one intentional exception (a day-grid is fundamentally wide) — keeps horizontal scroll with a sticky first column.

## 5. Filter chrome pass

Every search input + dropdown above every table swaps to SolidSearch / SolidSelect. Removes the current "translucent on gradient" look the screenshots flagged. Same treatment in HeroTile right slots.

## 6. Deliverable: tracker CSV

`/mnt/documents/table-redesign-tracker.csv` with columns: Route, Page name, Table(s), Status (Fixed/Pending), Notes. Every route in section 4 listed and marked Fixed at the end; the attendance calendar exception is called out explicitly.

## 7. Verification at 1280 / 1440 / 1920

For each route: confirm no `overflow-x` scroll, header alignment, padding `p-5 sm:p-6`, hover row, dropdown background solid, typography matches dashboard.

## Scope

~50 route files + 3 new components (DataTable, SolidSelect, SolidSearch). Purely presentational — no data, query, or behavior changes. One large change set; tracker CSV delivered at the end.
