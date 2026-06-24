
# Customizable Payroll Formula Engine — End-to-End

**North star:** non-technical admins at a security-guard firm with thousands of employees must (a) set up a new allowance/cost/addition/deduction in under 60 seconds, and (b) do bulk data entry across many employees without clicking through forms one by one.

All changes are **additive** — every existing row computes identically to today.

---

## 1. The "no-formulas" UX (priority #1)

Same **4-card editor** in every manager (Allowance, Cost, Addition Type, Deduction Type) so the client learns it once.

**Card 1 — Name it.** Big "Name" field. "Short tag" auto-fills (HRA). Icon picker. Done.

**Card 2 — How is it paid?** Tile picker, plain English, NO mode names:
- 🟦 **A fixed amount** — every employee gets ₹X.
- 🟩 **A % of other components** — checkbox pick (BASIC, DA…), enter %, optional cap.
- 🟧 **Add or subtract existing components** — visual chip builder `HRA + DA − PT`. This is how the client does `C = A + B` without seeing a formula.
- 🟪 **Different amount at different salary levels** — friendly slab table:
  ```
  When base salary is…     Pay…
  [ below 15,000 ]         [ 12% of BASIC + DA ]
  [ 15,000 and above ]     [ flat ₹1,200 ]
  [+ Add another rule ]
  ```
Advanced mode (collapsed) reveals a raw expression box. Most admins never open it.

**Card 3 — When does it count?** Toggles with help text:
- Same amount every payroll *or* scale with attendance.
- Include in overtime base?
- **Add this to Total Days?** (PH-style flag.)

**Card 4 — Live preview.** *"For a guard earning ₹18,000 with 26 P-days, this pays **₹X**."* Two sliders. Red banner instantly if it loops on itself, with "Show me what's wrong".

**Make it feel easy**
- Start-from-template tiles: "12% PF cap 15k", "HRA 40% of BASIC", "Washing flat ₹100".
- "Where is this used?" panel: contracts + in-progress payrolls affected.
- Inline validation, never modals. ₹/% suffixes on every input.

---

## 2. The "thousands of employees" UX (priority #2 — speed for bulk data)

This is what makes the system viable at the client's scale. Built once, reused everywhere a table of employees needs values.

**A. Excel-style bulk grid** on Additions, Deductions, and per-payroll component overrides:
- Sticky header + sticky first column (employee), keyboard navigation (`Tab`, `Enter`, arrows, `Esc`).
- Paste from Excel/CSV directly into a column or block (commonest workflow at scale).
- Fill-down (`Ctrl/Cmd+D`) and fill-series. Multi-cell select. Inline validation per cell.
- Undo/redo. "Save only changed rows" — never re-PUT untouched data.
- Virtualized rows (`@tanstack/react-virtual`) so 5k employees scroll at 60fps.
- Batched persistence: changes queued in memory, flushed in a single Supabase `upsert` per ~500 rows. Optimistic UI with rollback on failure.

**B. Filters that make 5k employees feel small** — branch, unit, designation, contract, "guards with no addition yet". Saved filter chips.

**C. Smart defaults & one-tap actions**
- "Apply ₹X to all filtered" / "Apply ₹X to selected".
- "Copy from last month" button on Additions and Deductions — pre-fills the entire grid with the previous run's values; admin tweaks only exceptions.
- Auto-save drafts (debounced 1s); never lose work on tab close.

**D. Bulk import / export**
- CSV import for additions and deductions with column auto-map by header name. Preview + row-level errors before commit.
- Export filtered grid back to CSV (already partly there — extend to additions/deductions).

**E. Speed in the formula managers**
- Cmd/Ctrl+K palette: jump to any allowance/cost/addition/deduction by name.
- Duplicate row → renames to "X (copy)" instantly, no extra dialog.
- Inline rename in the list table; no full-form open just to fix a typo.

**F. Performance budgets** (held throughout)
- List pages: react-query with 60s stale time + `select` projections; no full-row fetches when only id+name needed.
- Grid pages: row virtualization + cell-level memoization; only the edited cell re-renders.
- Payroll recompute: dependency-sorted, memoized per (contract, period); changing one allowance recomputes only dependents.
- All new tables/columns indexed on the filter keys (`branch_id`, `unit_id`, `period_id`, `candidate_id`).

---

## 3. Shared formula engine (under the hood, invisible)

Same engine powers all 4 managers. Stored as JSON; the UI never shows JSON.

Modes (each maps to one Card-2 tile): **Flat**, **Percentage of components** (chip + cap), **Composition** (`+`/`-` of tags — enables `C = A + B`), **Slabs** (ordered brackets, first match wins).

Cross-references resolved by topological sort; cycles caught at save and surfaced as the friendly red banner.

**Files**
- `src/lib/formula-engine.ts` — evaluator, slab matcher, dep graph, cycle detector.
- `src/lib/formula-context.ts` — eval context from contract resource + attendance totals.
- `src/components/ComponentEditor.tsx` — the 4-card editor, reused by all 4 managers.
- `src/components/BulkGrid.tsx` — the virtualized paste-friendly grid, reused by additions/deductions/overrides.
- Vitest specs: ref resolution, caps, slab boundaries, cycles, missing tags, per-duty proration, legacy parity.

Engine tokens: `P_DAYS`, `OT_DAYS`, `PH_DAYS`, `OTHER_PAID_DAYS`, `T_DAYS`, `BASE_DAYS`, `PER_DAY`, `EARNED_GROSS`, `GROSS`, plus every component tag.

---

## 4. Schema (additive, single migration)

```
allowance_types
  + short_code text
  + formula jsonb default '{}'
  + day_driver text default 'ratio'  -- 'ratio'|'flat'|'per_duty:<bucket>'
  + counts_in_t_days bool default false

cost_components
  + code text
  + formula jsonb default '{}'
  + day_driver text default 'ratio'

addition_types
  + formula jsonb default '{}'
  + default_amount numeric
  + qty_unit text                    -- 'days'|'hours'|'count'|null
  + rate_source text                 -- 'per_day'|'fixed'|'formula'
  + counts_in_t_days bool default false
  + t_days_bucket text

deduction_types               (mirror minus T-Days)

additions / deductions
  + qty numeric
  + computed_amount numeric          -- cached at payroll-run time

indexes added on (period_id, candidate_id), (branch_id, period_id) for grid speed.
```

Empty `formula` ⇒ existing columns drive the result. Backfill `short_code`/`code` from existing names so legacy rows already have a tag.

---

## 5. Payroll integration

- `computeWages`: build component map → resolve rows in dependency order → engine → legacy fallback when `formula` empty.
- `T Days = P + OT + PH + other_paid + Σ(additions where type.counts_in_t_days)` — answers the "PH → T Days, and any custom paid type too" ask in one line.
- Additions/deductions with `rate_source = formula | per_day` resolved through engine; manual amounts respected. Result cached in `computed_amount` so historical runs reproduce.
- ESI / PT / EPF statutory paths unchanged.

---

## 6. Contract sync

- Contracts hold **references** to allowances/cost components — edit in manager → every contract preview & future payroll auto-reflect. No re-save anywhere.
- Per-row manual overrides keep working with a "Manual override" badge + "Reset to formula".
- "Affected by your changes" banner on every formula edit: *"12 contracts and 3 in-progress payrolls will use the new amount."*

---

## 7. Additions & Deductions

- Type managers use the same 4-card editor.
- PH worked example: type = Paid Holiday, rate = Per-day from contract, **counts in T Days = ON**, bucket = `ph_days`.
- Additions/Deductions page uses the BulkGrid (Section 2). Old single-row form removed.

---

## 8. Activity logging & RBAC

- `logActivity` extended with formula JSON in details → System Logs reads like a diff.
- No new RBAC keys.

---

## 9. Rollout order

1. Additive migration + indexes + types regen.
2. Engine + Vitest specs.
3. `<ComponentEditor>` (4-card UI) — build once.
4. `<BulkGrid>` (virtualized paste grid) — build once.
5. Allowance Mgr → Cost Mgr → Addition Type Mgr → Deduction Type Mgr swap in editor.
6. Additions / Deductions pages swap in BulkGrid + "Copy from last month" + CSV import.
7. Payroll engine wiring + generalized T Days.
8. Contract "Affected by your changes" banner + reset-to-formula.
9. Verification: legacy contract → identical payroll output; `C = A + B` → correct in contract+payroll; PH addition → reflects in T Days; 12%/15k slab → matches hand calc; cycle → friendly error; 5k-row grid → smooth scroll + paste.

---

## Out of scope

- ESI/PT/EPF statutory logic unchanged.
- No bulk-edit of existing contracts (references update automatically).
- No new RBAC roles. No edge functions. No data wipes.

## Technical notes

- Hand-written precedence-climb parser (~150 LOC, no `eval`/`Function`).
- Pure deterministic evaluator → safe in payroll loops + SSR.
- All new columns nullable/defaulted → zero-downtime migration.
- BulkGrid: `@tanstack/react-virtual` + chunked Supabase upserts (≤500/req).
- `payroll-calc.ts` public API unchanged; callers don't move.
