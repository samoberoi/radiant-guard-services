# Attendance load — RCA & optimization plan

## 1. Where attendance is stored (confirmation)

Yes — it's in the Lovable Cloud database, not local/cached state.

- `public.attendance_entries` — one row per (unit, candidate, designation, date). Columns: `code` (P/A/WO/etc.), `ot_hours`, `entry_date`. Unique on (unit_id, candidate_id, designation_id, entry_date). Indexed on (unit_id, entry_date) and (candidate_id, entry_date).
- `public.attendance_sheets` — per-unit period header with status (draft/submitted/approved/rejected) and approval metadata.

## 2. Root cause of the 20-second load

The shared fetch helper `src/lib/attendance-fetch.ts` (function `fetchAttendanceEntriesForPeriod`) loops **one date at a time** and issues a separate Supabase request per day:

```
for each date in [periodStart .. periodEnd]:
    supabase.from('attendance_entries').select(...).eq('entry_date', date)
```

For a 31-day payroll month that's **31 sequential network round-trips**, each paying:
- HTTPS + PostgREST overhead
- RLS evaluation (`is_admin_user()` / `is_unit_in_current_user_branch(unit_id)`) on every request
- JWT verification

At ~500–700 ms each over a typical link, the total lands at ~15–25 s — matching what you're seeing. The empty grid renders first because the React Query state is `isLoading=true` while these 31 calls drain in series.

This same helper is used by:
- `admin.attendance.$unitId.tsx` (the payroll-period attendance view you tested)
- `admin.payroll.$unitId.tsx`
- `admin.invoice.$unitId.tsx`
- `admin.dashboard.tsx` (worst case — runs across many units in scope)

The DB itself is fine: `(unit_id, entry_date)` index is already in place; a single ranged query for the period would return in tens of ms.

## 3. Fix

Rewrite `fetchAttendanceEntriesForPeriod` to issue **one query for the whole period** using `entry_date.gte(start).lte(end)`, paginating by `range()` only if the row count exceeds the page size:

```ts
let from = 0;
while (true) {
  let q = supabase.from('attendance_entries')
    .select(selectCols)
    .gte('entry_date', start)
    .lte('entry_date', end)
    .order('entry_date', { ascending: true })
    .range(from, from + pageSize - 1);
  q = unitId ? q.eq('unit_id', unitId) : q.in('unit_id', unitIds);
  ...
}
```

Expected effect: 31 round-trips → 1 (or 2 for very large units). Load time should drop from ~20 s to well under 1 s for a single unit, and the dashboard's multi-unit case from minutes-class to seconds.

No schema change, no RLS change, no UI change — pure data-layer fix in one file. All four callers benefit automatically.

## 4. Verification after the change

- Open the same FPL Technologies May payroll attendance and confirm the grid populates immediately.
- Check browser Network tab: one `attendance_entries` request instead of ~31.
- Spot-check dashboard and payroll/invoice pages for the same unit to confirm no regressions in totals.

## 5. RCA report (for your records)

- **Symptom:** Attendance grid empty for ~20 s before data appears, every time, on every unit.
- **Scope:** All attendance / payroll / invoice / dashboard pages that read `attendance_entries` via the shared fetch helper.
- **Root cause:** Client-side fan-out — one Supabase request per calendar date in the selected period, awaited sequentially. Compounded by RLS re-evaluation on every request.
- **Not the cause:** Database size, missing indexes, RLS policy correctness, Edge Function CPU limit (this path doesn't use Edge Functions), or front-end rendering.
- **Fix:** Range query over the full period in a single request, with normal pagination only when row count demands it.
- **Prevention:** Treat "loop calls per day/row" as an anti-pattern in any future helper that talks to Supabase; always prefer a single ranged query.

Ready to implement on approval.
