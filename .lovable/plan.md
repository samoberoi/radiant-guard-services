## Goal
Keep the header horizontal (top-bar) like the current Radiant Guard screenshot, but refine its styling to match the reference dashboards (Fingoals, FinPay, Boltshift): a clean white rounded bar with a pill-style active nav item, compact icon+label links, and a rounded user chip on the right.

## Changes (UI only — `src/routes/admin.tsx` + minor tokens in `src/styles.css`)

1. **Layout**
   - Single sticky horizontal top bar (no sidebar, no vertical layout).
   - Full-width white surface, subtle bottom border, `h-16`, inner max-width container with `px-6`.
   - Left: brand (logo + "Radiant Guard / SERVICES PVT. LTD.").
   - Center: horizontal nav (Dashboard, Organizations ▾, Contracts ▾, Employees, Attendance, Payroll ▾, Invoice, Inventory ▾).
   - Right: notification bell with badge + rounded user chip (avatar circle with initials + phone/name + chevron).

2. **Nav item styling (reference-matched)**
   - Inactive: `text-foreground/70`, icon + label, `h-9 px-3 rounded-full`, hover `bg-muted`.
   - Active: solid dark pill `bg-primary text-primary-foreground rounded-full` (matches the black "Dashboard" pill in reference).
   - Dropdown carets via `ChevronDown` for grouped items; dropdown panels use existing Radix `DropdownMenu` with white card + soft shadow.
   - `whitespace-nowrap`, `shrink-0`, internal `overflow-x-auto scrollbar-hide` so the bar never causes page-level horizontal scroll.

3. **Right side**
   - Bell icon button (ghost, rounded-full) with red count badge.
   - User chip: `rounded-full border` container, left avatar circle (accent bg, initials), label text, `ChevronDown`.

4. **Mobile (<lg)**
   - Hide center nav, show hamburger that opens existing Sheet menu mirroring the same groups.

5. **Tokens**
   - No palette change. Keep navy `--primary` + blue `--accent`. Just ensure `--radius` pill usage and confirm `.scrollbar-hide` exists (already added).

## Out of scope
Page body, dashboard cards, routes, permissions, business logic — unchanged.