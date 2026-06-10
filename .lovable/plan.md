# Global Apple-style UI Polish

Goal: tighten alignment, calm the all-white feel with subtle tinted depth, smooth out interactions with iOS-style transitions, and pass through every table/page for consistency. No business logic changes.

## 1. P&L table redesign (admin.dashboard.tsx)
- Rebuild as a proper `<table>` grid: `Unit | Organization | Contract | Invoice | Payroll | Variance | Action`.
- Right-align all numeric columns, `tabular-nums`, consistent column widths via `table-fixed` + `colgroup`.
- Header: uppercase 11px tracking-wider, single-line (no awkward 2-line wraps like "CONTRACT / VALUE").
- Rows: 56px height, hairline `border-border/40` dividers, hover `bg-accent/[0.03]`, zebra removed for cleaner iOS feel.
- Unit cell: name on top, UN code as 11px `text-muted-foreground/70` chip-style underneath, never wrapping mid-word ("Kotak Mahindra / Pune Camp" wraps cleanly).
- Variance: pill badge with arrow icon, green/red semantic tokens, fixed-width so columns align. Fix the broken `- / ₹1,100` line break.
- "Open →" becomes an icon-only ghost button with chevron on hover-reveal, right-aligned in fixed 80px column.
- Sticky header inside scroll container; mobile collapses to stacked cards.

## 2. Background — kill the "too white"
Update `src/styles.css` `--background` and the admin shell backdrop:
- Light mode base shifts from pure white to `oklch(0.985 0.006 250)` (warm off-white with cool tint).
- Replace the current 3-blob radial wash in `admin.tsx` with a single calmer field: very subtle blue tint top-left + warm cream tint bottom-right at ~6% opacity, plus a faint noise/grain layer (`url(data:...)` SVG) at 3% for film texture.
- Cards become `bg-card` (pure white) so they pop against the tinted canvas → instant depth without color noise.

## 3. Route transitions (Apple-style)
- Add a `<RouteTransition>` wrapper in `src/routes/admin.tsx` around `<Outlet />` using framer-motion `AnimatePresence` keyed on `location.pathname`.
- Motion: `opacity 0→1` + `translateY 8px→0` + slight `scale 0.995→1`, duration 280ms, `cubic-bezier(0.32, 0.72, 0, 1)` (Apple's spring curve).
- Sidebar nav items: active state gets a smooth `layoutId` pill that slides between items.
- Stagger card mounts on dashboard with 40ms delay between tiles.

## 4. Global table component pass
Create `src/components/ui/data-table-shell.tsx` matching the new P&L style and apply to:
- admin.contracts.client-contracts, admin.customers.*, admin.employees lists, admin.attendance, admin.payroll, admin.invoice, admin.inventory.*, admin.vehicles.*, admin.system-logs, admin.rbac, all *-manager routes.
- Unified: 11px uppercase headers, 56px rows, hairline dividers, right-aligned numerics, sticky header, empty state with icon + helper text, loading skeleton rows.

## 5. CTA & emphasis hierarchy
- Primary action per page: filled accent button, slight gradient + inset highlight (iOS "glassy" button).
- Secondary: ghost with border `border-border/60`.
- Destructive: red tint only on hover, never resting (less alarming).
- Add `kbd`-style hint chips next to primary CTAs where shortcuts exist.
- Section headers get a thin accent bar on the left for scannability.

## 6. Micro-interactions
- All buttons: `active:scale-[0.97]` with `transition-transform duration-100`.
- Cards: hover lifts `-translate-y-0.5` + shadow grows, already partially in place — make consistent.
- Inputs: focus ring becomes soft accent glow instead of hard ring.
- Toast/sonner: glass blur background to match the rest.

## 7. Audit pass
After implementation, walk every admin route to catch:
- Headers wrapping awkwardly on 1024–1280px widths
- Tables overflowing horizontally without scroll affordance
- Buttons with inconsistent heights in the same row
- Mismatched border-radius (everything → `rounded-2xl` for containers, `rounded-xl` for inputs/buttons, `rounded-full` for pills/badges)

## Technical notes
- No new packages — framer-motion already installed.
- All color changes via design tokens in `src/styles.css`; no hex literals in components.
- Table shell is opt-in; existing tables migrate one route at a time but share the component.
- Activity logging unchanged (per project memory rule).
- Zero schema or server-fn changes.

## Out of scope
- No new features, no data model changes, no auth changes.
- Dark mode tuning if requested separately.
