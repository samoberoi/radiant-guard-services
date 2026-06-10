## Goal

Two outcomes:
1. Every table across the admin portal looks and behaves the same — clean, "iOS-like", no horizontal scrollbars, no cell-content wrapping into ugly two-line stacks (EMP ID, names, etc.), consistent paddings, alignment, typography and CTA placement.
2. The login screen is redesigned to match the portal's theme (dark sidebar + soft gradient surface, rounded cards, Radiant Guard branding), keeping the existing phone → OTP flow.

---

## Part 1 — Global table system (one source of truth)

Today every page renders tables with ad-hoc Tailwind classes. The shared `Table` primitives in `src/components/ui/table.tsx` are almost empty (no row spacing, no header style, no nowrap rules), so each route reinvents the look. That is why the Employees table:
- scrolls horizontally on 1280-ish viewports
- stacks `EMP ID` / `EMP-017` onto two lines
- shows different paddings/colors than e.g. Customers, Contracts, Inventory

### Fix at the primitive level

Rebuild `src/components/ui/table.tsx` so every table in the app inherits the same look without each route changing classnames:

- Container: `rounded-2xl border border-border/60 bg-card/70 backdrop-blur shadow-[0_1px_0_rgba(0,0,0,0.02)] overflow-hidden` — no inner horizontal scroll; the table fills its container.
- Header (`<thead>`): uppercase 11px tracked label, `text-muted-foreground/80`, sticky-friendly, divider underline.
- Rows: 56px target height, hairline divider (`divide-y divide-border/50`), `hover:bg-muted/40` transition.
- Cells: `px-4 py-3.5`, `align-middle`, `whitespace-nowrap` by default; an opt-in `data-wrap` attribute for cells that intentionally need wrapping (long addresses, notes).
- Numeric columns: right-aligned via a `numeric` variant.
- First/last cell get extra left/right padding for breathing room.
- A new `TableScroll` wrapper exposes horizontal scroll **only** when the parent really cannot fit, with edge fades — opt-in, not default.

### Eliminate horizontal scroll on Employees-style tables

A "responsive grid table" pattern, applied to wide list views (Employees, Candidates, Customers, Units, Contracts, Inventory items, Vehicles, Payroll, Invoice, Attendance):

- Replace each route's hand-rolled `<table>` with the shared primitives.
- Fix EMP ID to a single line: merge the `EMP-017` chip + dash row into one compact pill (`EMP‑017` with non-breaking hyphen, `tabular-nums`, `whitespace-nowrap`, fixed `w-[88px]`).
- Collapse "EMP ID" + "Employee" into one cell on `< xl` (avatar, name, EMP code as muted caption below). On `xl+` keep them as separate columns.
- Truncate long values with `min-w-0 truncate` + a `Tooltip` for the full string (Unit, Designation, Manager).
- Hide low-priority columns under a breakpoint (`hidden lg:table-cell`, `hidden xl:table-cell`) rather than scrolling: Active toggle and Status badge are always visible; Designation/Role/Manager fold in progressively.
- Action column pinned right, `w-[72px]`, vertical kebab menu instead of multiple inline buttons where space is tight.

### Consistency pass across every list page

For each of these routes, apply the same primitives + responsive priority rules so the look and behavior are identical:

```
admin.employees · admin.candidates.$id.details
admin.customers · .customer-manager · .branch-manager · .unit-manager · .state-manager
admin.contracts.client-contracts
admin.attendance.index · attendance.$unitId
admin.payroll.index · payroll.$unitId
admin.invoice.index · invoice.$unitId
admin.inventory.* (items, stock, goods-receipts, issuances, transfers, write-offs, adjustments, purchase-orders, vendors, warehouses, rate-cards)
admin.vehicles.* (inventory, insurances, pucs, fastags, service-manager, expense-manager)
admin.system-logs · admin.notifications · admin.rbac · admin.company-documents
all *-manager.tsx config pages (allowance, addition-type, deduction-type, designation, duty, esic-branch, lwf, professional-tax, payroll-days, billing-type, service-type, language, attendance-code, ex-service, offboarding-reason, asset, cost-component, vehicles.service-manager, vehicles.expense-manager)
```

For every page, also normalize:
- Page title block uses `PageHeader` (same H1 size, same description treatment, same breadcrumb spacing).
- Top "stat tiles" row uses the existing `Card` with one consistent grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`, `p-4`, 28px metric, 11px uppercase label, animated counter via existing `useCountUp`. Removes the cramped 5-across at 1280px that caused the Employees overflow.
- Filter bar: pill `Select` triggers, same height (h-10), same gap (`gap-2`), wraps onto a second row instead of growing wider than the page.
- Search input and primary CTA share a row, CTA right-aligned, identical 40px height, identical rounded-full styling.
- Tabs (Employees / Candidates style) use the shared `Tabs` primitive with the same active-pill treatment.

### Typography & spacing tokens

Add a couple of design tokens in `src/styles.css` so spacing/typography are enforced globally rather than per-page:
- `--table-row-h: 56px`
- `--table-cell-x: 16px`
- `--label-uppercase` utility (11px, 600, 0.06em tracking, muted)
- `--surface-card`, `--surface-table` for the slightly tinted card backgrounds visible in the screenshot.

---

## Part 2 — Login screen redesign

Goal: feel like part of the same portal — dark calm background, soft pastel/gradient surface, big rounded white card, Radiant Guard logo, same typography as the dashboard.

### Layout (`src/routes/login.tsx`)

```text
┌──────────────────────────────────────────────────────────────┐
│  Dark gradient backdrop (matches sidebar tone)              │
│                                                              │
│   ┌──────────────────────────────────────────────────┐       │
│   │ LEFT  (brand panel, soft mint→teal gradient)     │       │
│   │  • Radiant Guard logo + wordmark (top-left)      │       │
│   │  • Headline: "Welcome back"                      │       │
│   │  • Sub:  "Sign in to manage your guard force."   │       │
│   │  • 3 floating glass pills (existing):            │       │
│   │      – "12 guards on duty"                       │       │
│   │      – "Patrol Route A"                          │       │
│   │      – "Aurora Tower · Sector 21"                │       │
│   │  • Faint dotted grid + soft shield silhouette    │       │
│   ├──────────────────────────────────────────────────┤       │
│   │ RIGHT  (white card, form)                        │       │
│   │  • Small Radiant logo (mobile only)              │       │
│   │  • H1: "Sign in"                                 │       │
│   │  • Step 1: +91 prefix + 10-digit phone field     │       │
│   │            "Send OTP" pill button (brand green)  │       │
│   │  • Step 2: 6-slot OTP, resend timer, change #    │       │
│   │  • Footer: Terms · Privacy, version chip         │       │
│   └──────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### Visual rules

- Outer page background: same dark `#0d1f12`-style tone as the rest of the app shell, so the login card feels like the portal opening up.
- Card: `rounded-[28px]`, white, large soft shadow (`0_40px_120px_-30px_rgba(0,0,0,0.5)`), `grid md:grid-cols-2`.
- Left panel uses the brand mint→deep-green gradient already defined in `styles.css` (no more stock 3D illustration), with the Radiant Guard logo top-left and a subtle shield watermark.
- Typography: same `font-display` weights as PageHeader (`text-[44px]/[1.05] font-extrabold`).
- Buttons: full-radius pill, brand green, same hover/disabled treatment used in the dashboard primary CTA.
- OTP slots: 48×56, soft `bg-neutral-100`, focus ring in brand color, shake animation on error.
- Mobile: single column, brand panel collapses to a compact header strip with logo + tagline so the form stays above the fold.
- Reveal animation on successful sign-in kept.

### Logo handling

- Use the existing Radiant Guard badge from `src/components/BrandMark.tsx` (already used in the sidebar) so the login matches the sidebar 1:1.
- Add a small `"Radiant Guard Services Pvt. Ltd."` line under the wordmark, same treatment as the sidebar header.
- Leave a clearly-marked slot for the user-provided RevdInfo logo (footer "Powered by"). Placeholder until they hand the asset over — easy swap with one import.

### Functional behavior (unchanged)

- Phone → OTP flow, `useAuth().login`, `verifyOtp`, `DEMO_OTP_HINT`, toast on send, resend countdown, redirect to `/` on success — all preserved exactly as today.

---

## Out of scope

- No business-logic, schema, RLS or server-function changes.
- No new routes or features.
- The RevdInfo logo image itself — slot is reserved; the user can drop the asset in afterwards.

## Risk / verification

- Touching the shared `Table` primitive affects every page. Verification: spot-check Employees, Customers, Contracts, Inventory items, Vehicles inventory, Attendance, System Logs in the preview at 1280 / 1440 / 1920 widths — no horizontal scrollbar, EMP IDs on one line, identical row heights and header styling across pages.
- Login: verify both steps (phone + OTP), error shake, resend timer, and the post-login reveal animation still trigger.
