# Portal-Wide Design Unification

A single end-to-end pass over every admin route. Three shared primitives, then a sweep that retrofits them everywhere.

## 1. Sidebar — selected item in accent blue

Today the active sidebar item turns white-on-primary. Change it to a clear accent pill so the selected row is obvious at a glance.

- `src/routes/admin.tsx`
  - Top-level item (active): `bg-accent/12 text-accent ring-1 ring-accent/30` pill; icon chip flips to `bg-accent text-accent-foreground`.
  - Sub-item (active): `bg-accent/10 text-accent ring-1 ring-accent/25`, icon `text-accent`.
  - Same treatment in mobile drawer + collapsed-mode dropdown trigger.
  - Add a 3px left bar (`before:` pseudo) on active sub-items for extra affordance.
- Hover stays neutral (`bg-white/70`) so active vs hover are visually distinct.

## 2. Shared primitives (new files)

`src/components/HeroTile.tsx` — the "Leadership snapshot" tile, generalized.

```text
┌──────────────────────────────────────────────────────────┐
│ ◦ EYEBROW                                  [right slot]  │
│ Big Title           subtitle / chip                      │
│ optional description line                                │
└──────────────────────────────────────────────────────────┘
```

Props: `eyebrow`, `title`, `subtitle?`, `chip?`, `description?`, `right?` (ReactNode for month picker, filters, primary CTA). Reuses the same gradient/blur/glass styling lifted verbatim from the current dashboard hero (lines 475–510 of `admin.dashboard.tsx`).

`src/components/DataTable.tsx` — the P&L-styled table shell.

- Wraps the rounded-3xl card + header (title, description, totals strip) + body.
- Body uses `ios-table` with `table-fixed`, semantic alignment, `num` class for figures.
- Built-in responsive column hiding: each `column` accepts `hideBelow?: "sm"|"md"|"lg"|"xl"|"2xl"` → emits `hidden md:table-cell` etc. on both `<th>` and `<td>`. **No horizontal scroll** anywhere — overflow container is removed; instead columns drop out at smaller widths.
- Optional `rowExpand` render-prop for a "more" toggle row that re-surfaces hidden columns as a key/value grid (used where >7 columns exist).
- Slots: `title`, `description`, `totals?` (right-aligned key/value strip), `toolbar?` (filters/search), `empty`, `loading`.

`src/components/SectionCard.tsx` — a thin wrapper for non-table content cards (insight panels, forms) so every card across the portal shares radius, border, shadow, padding.

## 3. Apply HeroTile to every top-level admin page

Every list/dashboard page gets a HeroTile at the top, replacing whatever ad-hoc header it currently has (gradient banner, plain `PageHeader`, etc.). `PageHeader` is kept only for breadcrumbs which move inside the hero's eyebrow.

Pages updated (right slot in parens):

- `admin.dashboard` (month picker — already this shape, just swap to component)
- `admin.field-dashboard` (Add Candidate CTA)
- `admin.employees` (Add + filters)
- `admin.attendance.index` + `admin.attendance.$unitId` (unit + month)
- `admin.payroll.index` + `admin.payroll.$unitId` (month picker)
- `admin.invoice.index` + `admin.invoice.$unitId` (month picker)
- `admin.contracts.client-contracts` (status filter)
- `admin.customers.*` (4 pages — search)
- `admin.inventory.dashboard` + 13 inventory subpages
- `admin.vehicles.*` (8 pages)
- `admin.notifications`, `admin.profile`, `admin.system-logs`, `admin.rbac`
- `admin.control-center` (tile grid — hero kept above existing grid)
- All 18 "manager" pages under control-center (designation, allowance, duty, lwf, pt, esic-branch, asset, language, ex-service, billing-type, service-type, attendance-code, payroll-days, payroll, cost-component, offboarding-reason, addition-type, deduction-type)

## 4. Apply DataTable everywhere

Every existing table is rewritten on top of `DataTable`. Columns audited per page and a `hideBelow` rule assigned per column based on importance:

- Always visible: identity column (name/code), status, primary action, primary numeric.
- `hideBelow="md"`: secondary identifiers.
- `hideBelow="lg"`: metadata (designation, mobile, unit name when code shown, dates).
- `hideBelow="xl"` / `"2xl"`: tertiary (role, created-by, notes, sub-totals).

Critical wide tables that get the row-expand fallback so nothing is truly lost on narrow widths:

- `admin.employees` (employee + candidate tabs)
- `admin.payroll.$unitId` (earnings/deductions grid)
- `admin.attendance.$unitId` (calendar grid stays as-is — that one is intentionally horizontal)
- `admin.invoice.$unitId` (line items)
- `admin.inventory.purchase-orders`, `.goods-receipts`, `.issuances`, `.stock`, `.transfers`, `.write-offs`, `.adjustments`, `.rate-cards`
- `admin.contracts.client-contracts`

The attendance calendar is the **only** exception kept horizontally scrollable (a day-grid is fundamentally wide); it gets a sticky first column so it still reads cleanly.

## 5. Card consistency pass

Every standalone card (insight panels, stat groups, form sections, control-center tiles, field-dashboard StatCards, MiniStat) is rewritten through `SectionCard` or aligned to the same tokens: `rounded-3xl border border-border/70 bg-card shadow-[…dashboard-shadow…]`, padding `p-5 sm:p-6`, header row `flex items-end justify-between` with eyebrow + title + right slot. Equal heights via grid `auto-rows-fr` where cards share a row.

## 6. Token additions in `src/styles.css`

```css
@theme inline {
  --shadow-elevated: 0 1px 2px rgba(10,10,10,0.03), 0 20px 50px -30px rgba(10,20,40,0.15);
  --radius-tile: 1.5rem;       /* 24px */
  --radius-hero: 1.75rem;      /* 28px */
}
```

Add `.surface-tile`, `.surface-hero`, `.pill-active` utilities (via `@utility`) so every card/hero/active pill consumes the same recipe.

## 7. Verification

- Visit each route at 1280, 1440, 1920 widths in the preview; confirm no horizontal page scroll.
- Confirm sidebar active state on each top-level + sub-link is the accent pill.
- Confirm every page's first child is a HeroTile.
- Confirm every table is a DataTable (grep for raw `<Table` or `<table` outside `DataTable.tsx` and the attendance calendar).

## Scope note

This touches ~70 route files plus 3 new components. It will land as one large change set; expect a long apply step. Behavior, data flow, queries, and routes are untouched — this is purely presentational.
