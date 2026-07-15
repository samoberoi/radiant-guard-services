import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  PackageSearch,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  Warehouse,
  UserPlus,
  Activity,
} from "lucide-react";

import { HeroTile } from "@/components/HeroTile";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";

export const Route = createFileRoute("/admin/field-dashboard")({
  component: FieldOfficerDashboard,
});

type Guard = { id: string; full_name: string; designation: string };
type UnitNode = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  is_primary: boolean;
  guards: Guard[];
  pending_onboarding: number;
  open_demands: number;
  inventory_items: number;
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function FieldOfficerDashboard() {
  const { roleKey, isSuperAdmin } = useCurrentPermissions();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      const email = data.user?.email ?? "";
      const m = email.match(/phone-(\d{10})@/);
      setPhone(m?.[1] ?? "");
    });
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && roleKey && roleKey !== "field_officer") {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [roleKey, isSuperAdmin, navigate]);

  const dashQ = useQuery({
    queryKey: ["field-officer-dashboard-v3", phone, userId],
    enabled: !!phone,
    queryFn: async () => {
      const { data: me } = await supabase
        .from("candidates")
        .select("id,full_name")
        .eq("mobile", phone)
        .maybeSingle();
      const meId = (me as { id?: string } | null)?.id ?? null;
      const meName = (me as { full_name?: string } | null)?.full_name ?? "";
      const empty = {
        meName,
        units: [] as UnitNode[],
        guardsTotal: 0,
        joinedThisWeek: 0,
        joinedLastWeek: 0,
        attendanceRateToday: 0,
        attendanceRateYesterday: 0,
        pendingOnboardingTotal: 0,
        pendingOnboardingLastWeek: 0,
        openDemandsTotal: 0,
        inventoryItemsTotal: 0,
      };
      if (!meId) return empty;

      const [scopeRes, cuRes] = await Promise.all([
        supabase
          .from("employee_scope_assignments")
          .select("scope_id,scope_type")
          .eq("candidate_id", meId)
          .eq("scope_type", "unit"),
        supabase
          .from("candidate_units")
          .select("unit_id,is_primary")
          .eq("candidate_id", meId),
      ]);
      const scopeUnitIds = ((scopeRes.data ?? []) as Array<{ scope_id: string }>).map((r) => r.scope_id);
      const legacyUnits = ((cuRes.data ?? []) as Array<{ unit_id: string; is_primary: boolean }>);
      const primaryMap = new Map(legacyUnits.map((r) => [r.unit_id, r.is_primary]));
      const unitIds = Array.from(new Set([...scopeUnitIds, ...legacyUnits.map((r) => r.unit_id)]));

      let guardQuery = supabase
        .from("candidates")
        .select("id,full_name,designation_id,unit_id,role_key,status,is_enabled,reports_to,created_by,created_at")
        .in("role_key", ["guard", "security_guard"])
        .eq("status", "active")
        .eq("is_enabled", true);
      const teamFilters = [`reports_to.eq.${meId}`];
      if (userId) teamFilters.push(`created_by.eq.${userId}`);
      if (unitIds.length) teamFilters.push(`unit_id.in.(${unitIds.join(",")})`);
      guardQuery = guardQuery.or(teamFilters.join(","));
      const { data: myGuards } = await guardQuery;
      const guardList = (myGuards ?? []) as Array<{ id: string; full_name: string; designation_id: string | null; unit_id: string | null; created_at: string | null }>;

      const guardsMissingUnit = guardList.filter((g) => !g.unit_id).map((g) => g.id);
      const guardScopeUnit = new Map<string, string>();
      if (guardsMissingUnit.length) {
        const { data: gs } = await supabase
          .from("employee_scope_assignments")
          .select("candidate_id,scope_id,scope_type")
          .in("candidate_id", guardsMissingUnit)
          .eq("scope_type", "unit");
        for (const r of (gs ?? []) as Array<{ candidate_id: string; scope_id: string }>) {
          if (!guardScopeUnit.has(r.candidate_id)) guardScopeUnit.set(r.candidate_id, r.scope_id);
        }
      }
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? null;
        if (uid && !unitIds.includes(uid)) unitIds.push(uid);
      }

      const [unitsRes, custRes, mineRes, desigsRes, codesRes] = await Promise.all([
        unitIds.length
          ? supabase.from("units").select("id,code,name,customer_id").in("id", unitIds)
          : Promise.resolve({ data: [] as Array<{ id: string; code: string; name: string; customer_id: string | null }> }),
        supabase.from("customers").select("id,name"),
        userId
          ? supabase
              .from("candidates")
              .select("id,status,unit_id,created_by,created_at")
              .eq("created_by", userId)
          : Promise.resolve({ data: [] as Array<{ id: string; status: string; unit_id: string | null; created_by: string | null; created_at: string | null }> }),
        supabase.from("designations").select("id,name"),
        supabase.from("attendance_codes").select("code,counts_as_present"),
      ]);

      const desigMap = new Map(((desigsRes.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
      const custMap = new Map(((custRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
      const presentCodes = new Set(
        ((codesRes.data ?? []) as Array<{ code: string; counts_as_present: boolean }>)
          .filter((c) => c.counts_as_present)
          .map((c) => c.code),
      );

      const guardsByUnit = new Map<string, Guard[]>();
      const UNASSIGNED = "__unassigned__";
      const guardIdToUnit = new Map<string, string>();
      for (const g of guardList) {
        const uid = g.unit_id ?? guardScopeUnit.get(g.id) ?? UNASSIGNED;
        guardIdToUnit.set(g.id, uid);
        const arr = guardsByUnit.get(uid) ?? [];
        arr.push({
          id: g.id,
          full_name: g.full_name,
          designation: (g.designation_id && desigMap.get(g.designation_id)) || "—",
        });
        guardsByUnit.set(uid, arr);
      }

      // Attendance today vs yesterday → rate (%)
      const today = isoDaysAgo(0);
      const yday = isoDaysAgo(1);
      const guardIds = guardList.map((g) => g.id);
      let presentToday = 0, totalToday = 0, presentYday = 0, totalYday = 0;
      if (guardIds.length) {
        const { data: entries } = await supabase
          .from("attendance_entries")
          .select("candidate_id,code,entry_date")
          .in("entry_date", [today, yday])
          .in("candidate_id", guardIds);
        for (const e of (entries ?? []) as Array<{ candidate_id: string; code: string; entry_date: string }>) {
          if (e.entry_date === today) {
            totalToday += 1;
            if (presentCodes.has(e.code)) presentToday += 1;
          } else {
            totalYday += 1;
            if (presentCodes.has(e.code)) presentYday += 1;
          }
        }
      }
      const attendanceRateToday = totalToday ? Math.round((presentToday / totalToday) * 100) : 0;
      const attendanceRateYesterday = totalYday ? Math.round((presentYday / totalYday) * 100) : 0;

      // Onboarding trend — this week vs last week (candidates submitted by this FO)
      const mine = (mineRes.data ?? []) as Array<{ status: string; unit_id: string | null; created_at: string | null }>;
      const weekAgoIso = isoDaysAgo(7);
      const twoWeeksAgoIso = isoDaysAgo(14);
      const pendingOnboardingTotal = mine.filter((r) => ["pending", "rejected", "draft"].includes(r.status)).length;
      const pendingOnboardingLastWeek = mine.filter((r) => {
        const d = r.created_at ?? "";
        return d && d >= twoWeeksAgoIso && d < weekAgoIso && ["pending", "rejected", "draft"].includes(r.status);
      }).length;
      const pendingByUnit = new Map<string, number>();
      for (const c of mine) {
        if (!["pending", "rejected", "draft"].includes(c.status)) continue;
        const uid = c.unit_id ?? UNASSIGNED;
        pendingByUnit.set(uid, (pendingByUnit.get(uid) ?? 0) + 1);
      }

      // Joined this / last week (from active guards' created_at)
      let joinedThisWeek = 0, joinedLastWeek = 0;
      for (const g of guardList) {
        const d = g.created_at ?? "";
        if (!d) continue;
        if (d >= weekAgoIso) joinedThisWeek += 1;
        else if (d >= twoWeeksAgoIso) joinedLastWeek += 1;
      }

      // Open inventory demands per unit
      const demandsByUnit = new Map<string, number>();
      const inventoryByUnit = new Map<string, number>();
      try {
        const teamIds = [meId, ...guardIds];
        const orClauses = [`requested_by.in.(${teamIds.join(",")})`];
        if (unitIds.length) orClauses.push(`unit_id.in.(${unitIds.join(",")})`);
        const { data: demands } = await supabase
          .from("inv_demands" as never)
          .select("id,status,unit_id,requested_by")
          .or(orClauses.join(","))
          .in("status", ["pending", "approved", "partial", "open", "raised", "submitted"]);
        for (const d of (demands ?? []) as Array<{ unit_id: string | null }>) {
          const uid = d.unit_id ?? UNASSIGNED;
          demandsByUnit.set(uid, (demandsByUnit.get(uid) ?? 0) + 1);
        }
      } catch { /* ignore */ }
      try {
        if (guardIds.length) {
          const { data: bal } = await supabase
            .from("inv_stock_balances" as never)
            .select("location_type,location_id,qty")
            .in("location_type", ["guard", "security_guard", "field_officer"])
            .in("location_id", [meId, ...guardIds]);
          for (const b of (bal ?? []) as Array<{ location_id: string; qty: number }>) {
            const uid = guardIdToUnit.get(b.location_id) ?? UNASSIGNED;
            if (b.qty > 0) inventoryByUnit.set(uid, (inventoryByUnit.get(uid) ?? 0) + 1);
          }
        }
      } catch { /* ignore */ }

      const rawUnits = (unitsRes.data ?? []) as Array<{ id: string; code: string; name: string; customer_id: string | null }>;
      const units: UnitNode[] = rawUnits.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
        is_primary: primaryMap.get(u.id) ?? false,
        guards: guardsByUnit.get(u.id) ?? [],
        pending_onboarding: pendingByUnit.get(u.id) ?? 0,
        open_demands: demandsByUnit.get(u.id) ?? 0,
        inventory_items: inventoryByUnit.get(u.id) ?? 0,
      })).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

      const orphaned = guardsByUnit.get(UNASSIGNED) ?? [];
      const orphPending = pendingByUnit.get(UNASSIGNED) ?? 0;
      if (orphaned.length || orphPending) {
        units.push({
          id: UNASSIGNED,
          code: "—",
          name: "Unassigned",
          customer_name: "Map these to a unit",
          is_primary: false,
          guards: orphaned,
          pending_onboarding: orphPending,
          open_demands: demandsByUnit.get(UNASSIGNED) ?? 0,
          inventory_items: inventoryByUnit.get(UNASSIGNED) ?? 0,
        });
      }

      const guardsTotal = units.reduce((s, u) => s + u.guards.length, 0);
      const openDemandsTotal = units.reduce((s, u) => s + u.open_demands, 0);
      const inventoryItemsTotal = units.reduce((s, u) => s + u.inventory_items, 0);
      return {
        meName,
        units,
        guardsTotal,
        joinedThisWeek,
        joinedLastWeek,
        attendanceRateToday,
        attendanceRateYesterday,
        pendingOnboardingTotal,
        pendingOnboardingLastWeek,
        openDemandsTotal,
        inventoryItemsTotal,
      };
    },
  });

  const data = dashQ.data;
  const isLoading = dashQ.isLoading;
  const units = useMemo(() => data?.units ?? [], [data?.units]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <HeroTile
        eyebrow="Field operations"
        title={data?.meName || "Welcome"}
        description="Your team, today's attendance, and open items at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrendCard
          icon={ShieldCheck}
          label="Team size"
          value={String(data?.guardsTotal ?? 0)}
          delta={(data?.joinedThisWeek ?? 0) - (data?.joinedLastWeek ?? 0)}
          deltaSuffix=" new"
          hint={`${data?.joinedThisWeek ?? 0} joined this week`}
          accent="from-emerald-500/20 to-emerald-500/5 text-emerald-600"
        />
        <TrendCard
          icon={Activity}
          label="Attendance today"
          value={`${data?.attendanceRateToday ?? 0}%`}
          delta={(data?.attendanceRateToday ?? 0) - (data?.attendanceRateYesterday ?? 0)}
          deltaSuffix="pp"
          hint={`Yesterday ${data?.attendanceRateYesterday ?? 0}%`}
          accent="from-sky-500/20 to-sky-500/5 text-sky-600"
        />
        <TrendCard
          icon={ClipboardList}
          label="Pending onboarding"
          value={String(data?.pendingOnboardingTotal ?? 0)}
          delta={(data?.pendingOnboardingTotal ?? 0) - (data?.pendingOnboardingLastWeek ?? 0)}
          deltaSuffix=""
          invertColor
          hint="vs last week"
          accent="from-amber-500/20 to-amber-500/5 text-amber-600"
          to="/admin/employees"
        />
        <TrendCard
          icon={PackageSearch}
          label="Open demands"
          value={String(data?.openDemandsTotal ?? 0)}
          delta={0}
          deltaSuffix=""
          hint={`${data?.inventoryItemsTotal ?? 0} inventory items on team`}
          accent="from-violet-500/20 to-violet-500/5 text-violet-600"
          to="/admin/my-inventory"
          hideDelta
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <QuickAction to="/admin/employees" icon={UserPlus} label="Onboard employee" />
        <QuickAction to="/admin/my-inventory" icon={PackageSearch} label="My inventory" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">My units</h2>
            <p className="text-sm text-muted-foreground">Tap a unit to see the team and take action.</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
            {units.length} unit{units.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : units.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No units assigned to you yet. Ask HR to map you to your unit(s).
            </div>
          ) : (
            units.map((u) => <UnitRow key={u.id} unit={u} />)
          )}
        </div>
      </div>
    </div>
  );
}

function TrendCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaSuffix,
  hint,
  accent,
  to,
  invertColor,
  hideDelta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta: number;
  deltaSuffix: string;
  hint: string;
  accent: string;
  to?: string;
  invertColor?: boolean;
  hideDelta?: boolean;
}) {
  const positive = invertColor ? delta < 0 : delta > 0;
  const negative = invertColor ? delta > 0 : delta < 0;
  const TrendIcon = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const trendCls = delta === 0
    ? "bg-muted text-muted-foreground"
    : positive
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : negative
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  const inner = (
    <>
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accent}`} />
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        {!hideDelta && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendCls}`}>
            <TrendIcon className="h-3 w-3" />
            {delta > 0 ? "+" : ""}{delta}{deltaSuffix}
          </span>
        )}
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </>
  );
  const cls = "group relative block overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md";
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </Link>
  );
}

function UnitRow({ unit }: { unit: UnitNode }) {
  const [open, setOpen] = useState(false);
  const total = unit.guards.length;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-secondary/30"
      >
        <div className="flex min-w-0 items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {unit.name}
              {unit.is_primary && (
                <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Primary</span>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">{unit.customer_name} · <span className="font-mono">{unit.code}</span></div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-[11px] font-medium sm:flex">
          <Pill icon={ShieldCheck} tone="slate" value={total} label="team" />
          <Pill icon={CalendarCheck} tone="amber" value={unit.pending_onboarding} label="pending" />
          <Pill icon={PackageSearch} tone="violet" value={unit.open_demands} label="demands" />
          <Pill icon={Warehouse} tone="cyan" value={unit.inventory_items} label="items" />
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/40 bg-secondary/20 px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:hidden">
            <Pill icon={ShieldCheck} tone="slate" value={total} label="team" />
            <Pill icon={CalendarCheck} tone="amber" value={unit.pending_onboarding} label="pending" />
            <Pill icon={PackageSearch} tone="violet" value={unit.open_demands} label="demands" />
            <Pill icon={Warehouse} tone="cyan" value={unit.inventory_items} label="items" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {unit.id !== "__unassigned__" && (
              <>
                <Link to="/admin/attendance/$unitId" params={{ unitId: unit.id }} className="rounded-full border border-border bg-card px-3 py-1 font-medium hover:bg-secondary">
                  Mark attendance
                </Link>
                <Link to="/admin/employees" className="rounded-full border border-border bg-card px-3 py-1 font-medium hover:bg-secondary">
                  Onboard employee
                </Link>
              </>
            )}
          </div>
          {unit.guards.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground">No active employees on this unit yet.</div>
          ) : (
            <table className="ios-table min-w-full table-auto text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-2 pr-4">Name</th><th className="py-2">Designation</th></tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {unit.guards.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 pr-4 font-medium">{g.full_name}</td>
                    <td className="py-2 text-muted-foreground">{g.designation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ icon: Icon, tone, value, label }: { icon: React.ComponentType<{ className?: string }>; tone: "slate" | "amber" | "violet" | "cyan"; value: number; label: string }) {
  const toneCls = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    cyan: "bg-cyan-100 text-cyan-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${toneCls}`}>
      <Icon className="h-3 w-3" />
      <span className="tabular-nums font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
