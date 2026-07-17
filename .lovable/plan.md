## Goal

Add three insight cards to the role dashboards, all driven by `candidates.date_of_birth` and `candidates.approved_at`, with role-based scoping. Daily notifications fire when someone has a birthday or work anniversary today.

## New cards (no new pages)

Each card lives on the dashboard, right column, compact size. Rows are clickable and route to `/admin/candidates/$id/details`. Today's matches are pinned to the top with a highlighted chip and a congratulations line.

1. **Upcoming Birthdays** — next 30 days
   - Row: photo, name, unit / designation, date + "in N days" (or "Today 🎉" chip).
   - Shown on: super_admin, leadership, hr, branch_manager, field_officer dashboards.
2. **Upcoming Work Anniversaries** — next 30 days, using `approved_at` (fallback `created_at`)
   - Row: photo, name, "N years with RGS", date + "Today" chip.
   - Shown on: same dashboards as above.
3. **Employees 60+** — computed from `date_of_birth`
   - Sorted oldest first, shows age, unit, mobile.
   - Shown on: super_admin and leadership dashboards **only**.

## Scoping rules (enforced in query, not just UI)

- **super_admin, leadership, hr**: all active employees.
- **branch_manager**: candidates whose branch is in `current_user_branch_scope_ids()`.
- **field_officer**: candidates whose `unit_id` is in the FO's scoped unit set (reuse `useFieldOfficerUnitScope`).
- All queries filter `status IN ('approved','active')` and require `date_of_birth IS NOT NULL`.

## Daily notifications

- Add a public cron route `src/routes/api/public/hooks/daily-people-pings.ts` that:
  - Loads today's birthdays and today's work anniversaries (all active employees).
  - For each match, fans out a notification to the appropriate audience:
    - **Birthdays / anniversaries**: notify HR, leadership, super_admin, plus the person's branch_manager and reporting field_officer.
    - Title: "🎂 Birthday today — {name}" / "🎉 {N}-year work anniversary — {name}"; message includes designation + unit; link = `/admin/candidates/{id}/details`.
  - Dedupe by writing a `type` + `entity_id` + date-suffixed key so re-runs the same day are no-ops.
- Schedule with `pg_cron` at 03:30 UTC daily (09:00 IST) via `supabase--insert` after route ships.
- These notifications flow through the existing `NotificationBell` and `LiveFeed` (already clickable → link).

## Implementation

- **New file `src/components/PeopleInsightsCard.tsx`**: shared card component with three variants (`birthdays`, `anniversaries`, `sixty-plus`). Takes a pre-scoped list of candidates and computes/sorts client-side.
- **New file `src/lib/people-insights.ts`**: shared helpers — `daysUntilNextOccurrence(mmdd)`, `yearsSince(date)`, `ageFrom(dob)`, and a `usePeopleInsights({ scope })` hook that returns `{ birthdays, anniversaries, sixtyPlus }` with the scoping rules above.
- **Edit `src/routes/admin.dashboard.tsx`**: add a right-column stack rendering the three cards (60+ only when `isSuperAdmin || roleKey === 'leadership'`; birthdays/anniversaries always).
- **Edit `src/routes/admin.field-dashboard.tsx`**: add birthdays + anniversaries cards, scoped to `useFieldOfficerUnitScope().unitIds`. No 60+ card.
- **New file `src/routes/api/public/hooks/daily-people-pings.ts`**: cron handler described above, using `supabaseAdmin` loaded inside the handler.
- **Migration** (after route lands): schedule `pg_cron` job hitting the stable `project--{id}.lovable.app` URL.

## Out of scope

- No new standalone birthday/anniversary page.
- No changes to onboarding fields; DOB and approval date already exist.
- No email — in-app notifications only.
