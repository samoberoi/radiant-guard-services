## End-to-end UI/UX refinement pass

Acting as senior product designer, this pass fixes the readability, contrast, and layout issues visible in the three screenshots and rolls the same fixes across every role and page.

### Problems seen in screenshots

1. **P&L dashboard table** — numbers like `₹21,27,549` wrap across 3 lines in the header; variance pill wraps `(0.0%)` and `₹0` onto separate lines. Column widths are wrong and text is not `whitespace-nowrap` / `tabular-nums`.
2. **Payroll KPI tiles** — pastel yellow / mint / pink / blue tiles with same-tone labels give very low text contrast (fails WCAG AA). Numbers ("0") also sit on tinted backgrounds without enough weight.
3. **Client Contracts hero** — huge translucent white hero with pale grey KPI labels/values on near-white background; `AWAITING APPROVAL 0`, `REJECTED 0`, `LOST 1` almost invisible. Same glass-on-glass problem across all `PageHeader` KPIs.
4. **General** — buttons in hero (Export / Import / Create) sit on white with soft shadows and low separation; breadcrumbs and eyebrow labels too faint; some tab pills also low contrast.

### Fix strategy (design tokens first, then targeted layout fixes)

**A. Contrast + readability (global, one edit reaches every page)**

- `src/components/PageHeader.tsx`
  - Darken `eyebrow` (accent → `text-accent` at full strength, not `/90`) and breadcrumb text (`text-muted-foreground` not `/80`, active crumb `text-foreground`).
  - Description: bump from `text-muted-foreground` (light) to a darker token, tighten leading.
  - `PageStat`: replace white/70 glass with a more opaque surface (`bg-white/85` + stronger border) and use `text-foreground` for value, `text-muted-foreground` (not lighter) for label. Ensure value uses `font-semibold` not just display font weight cap.
- `src/routes/admin.payroll.*` KPI pastel tiles — swap pastel fills for the shared `PageStat` component (or restyle to `bg-white/85` with a small colored icon chip) so labels/values inherit the fixed contrast tokens. Keep the accent color only on the icon chip, not the whole tile.
- `src/styles.css` — nudge `--muted-foreground` one step darker so every "faint grey" label across the app becomes readable (single change, app-wide effect). Verify against light background; keep dark-mode variant unchanged.

**B. Table / number wrapping (P&L and every data table)**

- `src/routes/admin.dashboard.tsx` P&L table:
  - Header summary block: put `Contract / Invoice / Payroll / Variance` in a proper 2-col grid with `whitespace-nowrap tabular-nums` on values, right-aligned, so ₹21,27,549 stays on one line.
  - Table columns: add `whitespace-nowrap` to numeric cells, `tabular-nums`, right-align money columns; give the Variance pill `inline-flex whitespace-nowrap` so `↗ ₹0 (0.0%)` stays on a single line; constrain unit/org text columns with `min-w-0` + `truncate` + `title` attr for overflow.
- Sweep other data-heavy tables (payroll sheets, client contracts list, vehicles, inventory) for the same pattern: numeric cells → `whitespace-nowrap tabular-nums`, text cells → `min-w-0 truncate` with tooltip.

**C. Hero + button polish**

- `PageHeader` action slot: give primary action (`Create …`) a solid accent background with `text-accent-foreground` for clear affordance; keep Export/Import as outline with a visible border (`border-border` not `border-white/60`) so they don't disappear on white.
- Reduce hero vertical padding on desktop; the Client Contracts hero currently eats ~40% of viewport. Tighten `p-5 sm:p-6` → `p-4 sm:p-5` and cap KPI grid to 4-up on lg (already true) but shrink pill height.

**D. Navigation / sidebar sanity check**

- Sidebar active pill is fine, but the phone chip at the bottom (`+91 … 0002`) is on solid black — leave it; verify hover/focus tokens on collapsed state have visible contrast.

**E. Accessibility sweep**

- All icon-only buttons: verify `aria-label`.
- Ensure `PageStat` value/label pair meets 4.5:1 on the glass background after the token bump.
- Add `min-h-11 min-w-11` to primary tap targets in hero actions.

### Verification

- `tsgo --noEmit` after edits.
- Playwright screenshot of `/admin/dashboard`, `/admin/payroll`, `/admin/contracts/client-contracts` at 1440px and 1024px; confirm no wrapped numbers and readable KPIs.
- Spot-check one page per role cluster (Attendance, Inventory, Vehicles, Assets, Org Settings) that inherit `PageHeader` + `PageStat` — no per-page edits needed unless they override tokens.

### Files expected to change

- `src/styles.css` (muted-foreground token)
- `src/components/PageHeader.tsx` (contrast, eyebrow, PageStat surface, action button treatment)
- `src/routes/admin.dashboard.tsx` (P&L header + table nowrap/tabular)
- `src/routes/admin.payroll.index.tsx` (KPI tile restyle)
- `src/routes/admin.contracts.client-contracts.tsx` (hero density + KPI contrast if not fully covered by PageHeader change)
- Minor sweeps in tables flagged during Playwright review

Out of scope: business logic, data model, route structure.
