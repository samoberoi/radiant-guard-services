
# Global Redesign: Glassmorphism + Login Revamp + Dashboard Visuals

A three-part overhaul applied consistently across every admin page and role.

## 1. Background & Global Theme

- Remove the grid/check lines from the app canvas (`src/styles.css` `.app-canvas-grid`).
- Replace with a clean, soft gradient backdrop: subtle blue → cyan → lavender wash, no lines, no noise.
- Introduce a `.glass` utility (and `.glass-strong`, `.glass-dark`) using `backdrop-filter: blur(20px) saturate(160%)`, semi-transparent white, hairline inner border, soft layered shadow.
- Apply `.glass` to: `Card`, `PageHeader` container, sidebar, stat tiles, filter bars, table shells, dialogs, dropdown menus, the notification bell panel.
- Tighten the design token set so every page pulls the same surface, border, shadow, and radius values.

## 2. Page-by-Page Consistency Pass

Audit every route under `src/routes/admin.*` and align:

- **Headings**: same font size / weight / breadcrumb style as Dashboard (uses `PageHeader`). Fix pages where the title sits at a different size or alignment.
- **Stat cards**: replace the mixed card styles seen on Employees (Total/Active/Inactive/NDA), Attendance (Org/Units/Active), Payroll/Invoice (dark hero block) with one shared `.glass` stat tile + matching icon chip.
- **Filter bars**: unify the chip/pill row across Employees, Attendance, Payroll, Invoice, Inventory, Vehicles, all *-Manager pages.
- **Tables**: keep `.ios-table` shell, but wrap in a `.glass` panel with consistent padding, header treatment, row hover, and right-aligned action icons (the colored circular action icons on Employees become the standard everywhere).
- **CTAs**: standardize primary (filled dark pill) + secondary (glass outline pill) used on Deductions/Additions across all pages.
- **Icon style**: lucide outline, 1.5 stroke, color-tinted chip backgrounds matching the Dashboard.

## 3. Dashboard Visuals (Payroll/Invoice hero kept, expanded)

- Add gradient bar charts (revenue, headcount, attendance trend) using existing `recharts` (`src/components/ui/chart.tsx`).
- Add a radial gauge ("speedometer") component for utilization / approval rate with tick marks and a numeric readout.
- Add count-up animations on every stat tile number (lightweight `useCountUp` hook, no new deps).

## 4. Motion & Transitions

- Keep route slide-up; add a stronger "reveal" sequence: cards stagger-fade-up on mount (40ms stagger, 280ms each), tables fade in after.
- Add count-up on numeric values across Employees, Attendance, Payroll, Invoice, Dashboard.
- Dialogs/sheets get a scale+blur-in.
- All new motion via existing `framer-motion` (already in deps) — no new packages.

## 5. Login / OTP Screen Redesign

Rebuild `src/routes/login.tsx` from scratch:

- Full-bleed background: brand gradient (deep navy → indigo → teal) with soft animated aurora blobs (CSS only).
- Centered glass card (heavy blur, hairline border, layered shadow) — matches reference vibe but in brand colors, not lavender.
- Step 1: phone input with country chip, large numeric keypad-friendly field, animated focus ring.
- Step 2: OTP — 6 segmented input boxes that auto-advance, animated underline fill, shake on error.
- "Confirm" CTA triggers a full-screen slide-up reveal that transitions into the portal (overlay element animating to cover screen, then routes; portal then plays its stagger-reveal).
- Subtle floating particles / brand mark animation in idle state.

## 6. Roll Out Across Roles

The glass tokens, stat tile, filter bar, table shell, and motion utilities live in shared components, so every role (super admin, admin, field, etc.) inherits them automatically. We'll spot-check field-dashboard, control-center, RBAC, profile, notifications, and customer/vendor/inventory/vehicle pages to confirm.

## Technical Notes

- New/edited shared pieces:
  - `src/styles.css` — remove grid, add gradient bg, add `.glass*` tokens, refine `.ios-table` for glass surfaces.
  - `src/components/ui/card.tsx` — opt-in `glass` variant, default uses new tokens.
  - `src/components/StatTile.tsx` (new) — unified stat card with count-up + icon chip.
  - `src/components/GradientBarChart.tsx`, `src/components/RadialGauge.tsx` (new) for dashboard.
  - `src/components/PageReveal.tsx` (new) — wraps Outlet content with stagger reveal.
  - `src/hooks/useCountUp.ts` (new).
  - `src/routes/login.tsx` — full rewrite.
  - `src/routes/admin.tsx` — wire PageReveal, login→portal transition handoff.
- Audit + patch all `admin.*.tsx` routes to use shared StatTile, glass Card, unified filter bar markup.
- No backend / data changes. No new npm packages (framer-motion + recharts already present).

## Out of Scope

- Business logic, data shape, RLS, route structure.
- Mobile-specific redesign beyond the responsive behavior already in place.
