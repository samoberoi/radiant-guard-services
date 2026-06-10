## Goal

Redesign the entire Radiant admin portal to match the reference dashboard's structure and polish, using a high-contrast navy/yellow/white/black palette. Replace the left sidebar with a horizontal top navigation that opens dropdown menus, and rebuild the admin dashboard cards to feel like the reference (large stat numbers, dotted/segmented charts, gauge, profile hero card, right-rail list). Then push the new tokens, spacing, and card style across every admin module so the whole app feels cohesive — no more orphan styling.

## Design language

- Palette (locked, applied via `src/styles.css` `@theme` tokens):
  - Background: `#FFFFFF` (page), `#F5F6F8` (app surround)
  - Ink / primary: `#0A0A0A` (text, dark cards)
  - Brand blue: `#1E3A8A` (filled stat cards, primary buttons)
  - Accent yellow: `#FACC15` (highlights, active pill, key numbers, badges)
  - Borders: `#E5E7EB`; muted text: `#6B7280`
- Typography: keep the existing Space Grotesk display + Montserrat body, but tighten weights — display 800/700 for hero numbers, 600 for card titles, 500 body. Remove the broken remote `@import` in `src/styles.css` and load fonts via `<link>` in `__root.tsx` (also fixes the current /src/styles.css 500).
- Radii: cards `rounded-3xl` (24px), inner chips `rounded-full`. Soft shadow `0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(10,10,10,.08)`.
- Spacing system: page gutter 24px desktop / 16px mobile, 24px gap between cards, 20px inner card padding. Standardize via utility classes so every module inherits the same rhythm.

## Navigation: sidebar → top bar with dropdowns

Replace the left rail in `src/routes/admin.tsx` with a sticky top bar.

- Left cluster: brand mark + horizontal menu mirroring the current sidebar groups exactly (Dashboard, Employees, Customers, Contracts, Attendance, Invoice, Payroll, Inventory, Vehicles, Control Center, etc.).
- Group with children renders a button + chevron; click opens a dropdown panel (Radix `DropdownMenu`, animated fade+slide, 150ms). Single-link groups render as plain link.
- Active item: yellow pill background, black text, matching the reference's pill nav.
- Right cluster: global search input, notifications bell, profile avatar with menu (profile/logout).
- Mobile: collapse to a single "Menu" button that opens a full-screen sheet listing the same groups (accordion). Keeps RBAC filtering intact via `useCurrentPermissions`.
- Role gating preserved — Field Officer and Guard get the same shell but only see their permitted items (their reduced menus naturally collapse to a short top bar).

## Admin dashboard rebuild (`src/routes/admin.dashboard.tsx`)

Recompose into the reference's 3-column grid (12-col on desktop, stacks on tablet/mobile). Real data, no mock numbers — wire each tile to the existing queries already in this file.

```
┌──────────────┬───────────────────────────┬──────────────────┐
│ Hero profile │ Big stat + dotted chart   │ Right rail:      │
│ (current     │ (avg hours / week)        │ Payroll cycle    │
│  user card)  ├─────────────┬─────────────┤ list with        │
│              │ Onsite 80%  │ Remote 20%  │ status pills     │
├──────────────┼─────────────┴─────────────┤                  │
│ Avg work     │ Track your team (gauge:   │                  │
│ time line    │ total active employees)   │                  │
│ chart        ├───────────────────────────┤ P&L summary      │
│              │ Talent recruitment        │ card (dark navy, │
│              │ (candidates pending vs    │ yellow accents,  │
│              │  approved bar chart)      │ Take-home style) │
└──────────────┴───────────────────────────┴──────────────────┘
```

Tile mapping to real data:
- Hero profile → current user (name, role, employee code) with phone/email quick actions.
- Big stat + dotted chart → avg attendance days/employee for current payroll window; dots = last 30 days punches.
- Onsite/Remote split → guards currently on duty vs off duty.
- Avg work time line → 7-day attendance trend.
- Gauge "Track your team" → active employee count vs target headcount across active contracts, segmented by designation.
- Talent recruitment → candidates: matched (approved) vs not match (pending HR), bar chart by week.
- Right rail list → recent payroll runs / unit-level payroll status with Done / Waiting / Failed pills.
- Dark navy P&L summary → existing Contract / Invoice / Payroll / Variance numbers, restyled with yellow primary number and Take-home-style hierarchy.

## Module-wide application

After the shell + dashboard, sweep every admin route to inherit the new look without rewriting business logic:

- `PageHeader` component: restyle to match (breadcrumb + bold title left, action chips right).
- Tables: white card, `rounded-3xl`, sticky header in `bg-secondary/60`, row hover `bg-yellow-50`, status badges in the new palette (yellow=pending, blue=in-progress, black=done, red=failed).
- Buttons: primary = navy bg / white text; secondary = white / black border; accent CTA = yellow / black text.
- Forms/dialogs: same radius/border tokens; inputs `h-10 rounded-xl border-border`.
- Stat tiles across modules (Invoice, Payroll, Inventory dashboards) reuse a new `<StatCard>` primitive that matches the dashboard tiles.
- Fix alignment & overflow: apply the responsive-header pattern (`grid-cols-[minmax(0,1fr)_auto]` + `min-w-0` + `truncate`) anywhere a current page wraps awkwardly.

## Technical notes

- Files touched (high level):
  - `src/styles.css` — replace tokens (oklch), remove the remote `@import url(...)` line (currently breaking the dev server), add `--brand-yellow`, `--brand-blue` mapped via `@theme inline`.
  - `src/routes/__root.tsx` — add Google Fonts `<link>` tags in `head()`.
  - `src/routes/admin.tsx` — full rewrite of layout: remove sidebar, add `<TopNav>` + `<MobileMenu>`; keep all RBAC filter logic.
  - New components: `src/components/TopNav.tsx`, `src/components/StatCard.tsx`, `src/components/SectionCard.tsx`.
  - `src/routes/admin.dashboard.tsx` — recompose into the new grid; reuse existing data queries.
  - `src/components/PageHeader.tsx` — restyle (no API change).
  - Touch sweep on module routes (`admin.employees.tsx`, `admin.invoice.*`, `admin.payroll.*`, `admin.attendance.*`, `admin.inventory.*`, `admin.vehicles.*`, `admin.customers.*`, `admin.contracts.*`, control-center children) — swap surface classes to the new tokens, no logic changes.
- No DB / RBAC / business-logic changes. Field Officer / Guard restricted views remain intact.
- Charts: keep `recharts` already in the project; restyle colors via the new tokens. Dotted chart = small `recharts` scatter or hand-rolled CSS grid of dots driven by data.
- Risk: this is a large visual sweep across ~40 route files. To keep regressions low, the shell + dashboard + shared primitives ship first; the module sweep follows in the same plan but is mechanical (token swaps).

## Out of scope

- No changes to data models, server functions, RBAC rules, or any module's business logic.
- No new features — purely UI/visual + navigation structure.
- Login / welcome / public routes keep their current styling unless they share components that get updated.
