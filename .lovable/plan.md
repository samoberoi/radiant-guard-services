## Goal
Make tables, action buttons, and dropdowns visually consistent and production-ready across every admin page — globally, via shared CSS + shared primitives, not page-by-page hacks.

## Problems being fixed

1. **Action column misalignment** — Header "ACTIONS" sits far right while icons float left of it; STATUS pill + toggle are on different baselines vs the header label.
2. **Action button spacing irregular** — gaps differ per row because authors group buttons in nested wrappers; some buttons render as plain `<button>` with no circular bg.
3. **Status + action overlap on Client Contracts** — "Approve / Reject" text buttons + status pill + date cell overlap because the columns aren't sized and actions aren't constrained to icon-only pills.
4. **Candidate row CTAs (approve ✓ / reject ✗) look broken** — colored chips touching the status pill with no spacing/sizing.
5. **First icon under Unit (Attendance/Invoice/etc.)** missing circular background — only some icon buttons get the global treatment because the CSS selector requires `[data-col="actions"]`.
6. **Hover contrast bug in dropdowns** — Select/Command/DropdownMenu items use blue hover bg but inner text keeps its dark color → unreadable. Need globally white text + white icons on `[data-highlighted]` / `[data-state=checked]`.
7. **Action icon hover contrast** — when hover bg darkens, icon stays dark; need to force light icon color on hover.

## Changes

### A. `src/styles.css` — global table + action rules
- Tighten `.ios-table [data-col="actions"]`:
  - Set header cell (`thead th[data-col="actions"]`) to `text-align: right; padding-right: 20px;` and force the inner sort button to right-align so the "ACTIONS" label sits directly above the icons.
  - Constrain column `width: 168px`, `gap: 4px`, and add `justify-content: flex-end` on the inner flex wrapper.
  - Replace the `div { display: contents }` trick with `:where(div, span) { display: contents }` scoped to the actions cell so deeply nested wrappers all flatten.
- Make the circular-pill rule apply to ALL icon-only action buttons in tables, not just `[data-col="actions"]`:
  - New selector: `.ios-table tbody td button:where(:has(> svg:only-child)), .ios-table tbody td a:where(:has(> svg:only-child))` → 32×32 circle, `bg: white`, `border: 1px solid var(--border)`, `color: var(--muted-foreground)`.
  - Hover state: `bg: var(--foreground); color: white;` and force `svg { color: inherit }` so the icon flips to light on dark hover.
  - Variant-preserving: skip elements with `[data-variant]` or `[data-no-pill]` so colored CTAs (approve green / reject red) keep their look but still get sized to 32×32 circle.
- Add a status-column width rule `[data-col="status"] { width: 132px; text-align: left }` and a `[data-col="approval"] { width: 150px }` so Approval pills + Start date stop overlapping on Client Contracts.
- Header alignment: every `.ios-table thead th[data-col="actions"] button` → `justify-content: flex-end; width: 100%`.

### B. `src/components/ui/select.tsx`, `dropdown-menu.tsx`, `command.tsx`
- Update item classes so the highlighted/active state uses `bg-accent text-white [&_svg]:text-white` (currently `text-accent-foreground` which resolves to dark in some items because authors override text color inline). Add `[&_*]:!text-white` on the highlighted state to override descendant color utilities (the "UN12", "NOMANS" blue labels in the screenshot).

### C. `src/routes/admin.contracts.client-contracts.tsx`
- Convert the Approve/Reject/Renew text buttons in the row to icon-only buttons with `title` tooltips (Check / X / RotateCcw icons), so they obey the global 32×32 circular rule and stop overlapping the Start date column.
- Add `data-col="approval"` to the Approval header/cell and `data-col="actions"` to Actions so the new widths apply.

### D. `src/routes/admin.employees.tsx` (Candidates tab row)
- Wrap the green ✓ and red ✗ approve/reject chips as proper icon buttons with `data-variant="success"` / `data-variant="danger"` so they pick up colored circular styling instead of touching the Pending pill.
- Ensure header row has `data-col="status"` and `data-col="actions"` so columns line up.

### E. Other tables (Attendance, Invoice, Inventory, Vehicles, Customers/Unit/Branch/State managers, etc.)
- Audit pass: ensure each table's actions `<th>` has `data-col="actions"` and each first-icon-only cell uses a plain `<button><Icon/></button>` (no extra wrapper classes) so the new global selector picks them up automatically. No per-page restyling needed beyond adding the `data-col` attribute where missing.

## Verification
- Reload `/admin/employees`, `/admin/employees` (Candidates tab), `/admin/contracts/client-contracts`, `/admin/attendance`, `/admin/invoice` — confirm:
  - Action header sits directly above the icon group.
  - All action icons are equal-sized circles with equal 4–6 px gap.
  - Hovering an icon flips bg dark / icon white.
  - Opening any Select/Combobox/DropdownMenu shows white text + white icons on the blue highlighted row (UN12 / NOMANS labels included).
  - Client Contracts row: Approval pill no longer overlaps Start date; Approve/Reject are icon pills.
